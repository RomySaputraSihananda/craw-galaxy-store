import fs from "fs-extra";
import strftime from "strftime";
import crypto from "crypto";
import xml2json from "xml2js";
import fetch from "node-fetch";
import { infoLog, updateLog, writeLog } from "./utils/logsio.js";
import { uploadS3Json } from "./utils/upload-s3.js";

const bodies = [
  `<?xml version="1.0" encoding="UTF-8"?><SamsungProtocol networkType="0" version2="0" lang="EN" openApiVersion="28" deviceModel="SM-G998B" storeFilter="themeDeviceModel=SM-G998B_TM||OTFVersion=8000000||gearDeviceModel=SM-G998B_SM-R800||gOSVersion=4.0.0" mcc="450" mnc="00" csc="CPW" odcVersion="4.5.21.6" version="6.5" filter="1" odcType="01" systemId="1604973510099" sessionId="10a4ee19e202011101104" logId="XXX" userMode="0">
    <request name="normalCategoryList" id="2225" numParam="4" transactionId="10a4ee19e011">
      <param name="needKidsCategoryYN">Y</param>
      <param name="imgWidth">135</param>
      <param name="imgHeight">135</param>
      <param name="upLevelCategoryKeyword">Games</param>
    </request>
  </SamsungProtocol>`,
  `<?xml version="1.0" encoding="UTF-8"?><SamsungProtocol networkType="0" version2="0" lang="EN" openApiVersion="28" deviceModel="SM-G998B" storeFilter="themeDeviceModel=SM-G998B_TM||OTFVersion=8000000||gearDeviceModel=SM-G998B_SM-R800||gOSVersion=4.0.0" mcc="450" mnc="00" csc="CPW" odcVersion="4.5.21.6" version="6.5" filter="1" odcType="01" systemId="1604973510099" sessionId="10a4ee19e202011101104" logId="XXX" userMode="0">
    <request name="normalCategoryList" id="2225" numParam="4" transactionId="10a4ee19e011">
        <param name="needKidsCategoryYN">Y</param>
        <param name="imgWidth">135</param>
        <param name="imgHeight">135</param>
        <param name="gameCateYN">N</param>
    </request>
    </SamsungProtocol>`,
];

class Galaxystore {
  #BASE_URL = "https://galaxystore.samsung.com";
  #id_project = crypto.createHash("md5").update(this.#BASE_URL).digest("hex");

  constructor() {
    this.#start();
  }

  async #writeFile(outputFile, data) {
    await fs.outputFile(outputFile, JSON.stringify(data, null, 2));
  }

  async #start() {
    const datas = [];
    for (const body of bodies) {
      const response = await fetch(
        `${this.#BASE_URL}/storeserver/ods.as?id=normalCategoryList`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/xml",
            "X-country-channel-code": "id-odc",
          },
          body,
        }
      );

      xml2json.parseString(await response.text(), function (err, result) {
        datas.push(
          ...result.SamsungProtocol.response[0].list.map((e) => {
            return {
              [e.value[0].$.name]: e.value[0]._,
              [e.value[2].$.name]: e.value[2]._,
            };
          })
        );
      });
    }

    datas.forEach(async (data) => {
      const gameIds = await this.#getGame(data);

      for (const gameId of gameIds) {
        await this.#process(gameId);
      }
    });
  }

  async #getGame({ categoryName, categoryID }) {
    return new Promise(async (res, rej) => {
      try {
        const response = await fetch(
          "https://galaxystore.samsung.com/storeserver/ods.as?id=categoryProductList2Notc",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/xml",
              "X-country-channel-code": "id-odc",
            },
            body: `<?xml version="1.0" encoding="UTF-8"?>
            <SamsungProtocol networkType="0" version2="0" lang="EN" openApiVersion="28" deviceModel="SM-G998B" storeFilter="themeDeviceModel=SM-G998B_TM||OTFVersion=8000000||gearDeviceModel=SM-G998B_SM-R800||gOSVersion=4.0.0" mcc="310" mnc="03" csc="MWD" odcVersion="9.9.30.9" version="6.5" filter="1" odcType="01" systemId="1604973510099" sessionId="10a4ee19e202011101104" logId="XXX" userMode="0">   
            <request name="categoryProductList2Notc" id="2030" numParam="10" transactionId="10a4ee19e126"> 
                <param name="imgWidth">135</param>
                <param name="startNum">1</param>
                <param name="imgHeight">135</param>
                <param name="alignOrder">bestselling</param>
                <param name="contentType">All</param>
                <param name="endNum">500</param>
                <param name="categoryName">${categoryName}</param>
                <param name="categoryID">${categoryID}</param>
                <param name="srcType">01</param>
                <param name="status">0</param>
            </request>
            </SamsungProtocol>`,
          }
        );
        let data;

        xml2json.parseString(await response.text(), function (err, result) {
          data = result.SamsungProtocol.response[0].list.map((e) => {
            return e.value[17]._;
          });
        });

        res(data);
      } catch (e) {
        rej([]);
      }
    });
  }

  async #getReviews(contentId, i) {
    const response = await fetch(
      `${this.#BASE_URL}/api/commentList/contentId=${contentId}&startNum=${i}`
    );
    const { commentList } = await response.json();

    if (!commentList.length) return null;
    return commentList;
  }

  #parseDate(text) {
    const date = text.replace(".", "-");
    return [
      strftime("%Y-%m-%d %H:%M:%S", new Date(date)),
      new Date(date).getTime(),
    ];
  }

  async #process(id) {
    let response;
    try {
      response = await fetch(`${this.#BASE_URL}/api/detail/${id}`);
    } catch (e) {
      return;
    }

    const {
      DetailMain,
      appId,
      Screenshot,
      SellerInfo,
      commentListTotalCount,
      errCode,
    } = await response.json();

    if (errCode) return;

    const link = `${this.#BASE_URL}/detail/${appId}`;
    const title = DetailMain.contentName;
    console.log(
      `[ ${response.status} ] [ ${response.headers.get(
        "Content-Type"
      )} ] try ${link}`
    );

    const domain = this.#BASE_URL.split("/")[2];

    const log = {
      Crawlling_time: strftime("%Y-%m-%d %H:%M:%S", new Date()),
      id_project: null,
      project: "Data Intelligence",
      sub_project: "data review",
      source_name: this.#BASE_URL.split("/")[2],
      sub_source_name: DetailMain.contentName,
      id_sub_source: appId,
      total_data: 0,
      total_success: 0,
      total_failed: 0,
      status: "Process",
      assign: "romy",
    };
    writeLog(log);

    const headers = {
      link,
      domain,
      tag: link.split("/").slice(2),
      crawling_time: strftime("%Y-%m-%d %H:%M:%S", new Date()),
      crawling_time_epoch: Date.now(),
      reviews_name: DetailMain.contentName,
      description_reviews: DetailMain.contentDescription,
      description_new_reviews: DetailMain.contentNewDescription,
      publisher_reviews: DetailMain.sellerName,
      publisher_info_reviews: {
        seller_trade_name: SellerInfo.sellerTradeName,
        representation: SellerInfo.representation,
        seller_site: SellerInfo.sellerSite,
        first_name: SellerInfo.firstName,
        last_name: SellerInfo.lastName,
        seller_number: SellerInfo.sellerNumber,
        first_seller_address: SellerInfo.firstSellerAddress,
        second_seller_address: SellerInfo.secondSellerAddress,

        registration_number: SellerInfo.registrationNumber,
        report_number: SellerInfo.reportNumber,
      },
      limit_age_reviews: parseInt(DetailMain.limitAgeCd),
      size_in_mb_reviews: parseFloat(
        DetailMain.contentBinarySize.replace(" MB", "")
      ),
      content_binary_version_reviews: DetailMain.contentBinaryVersion,
      local_price_rp_reviews: parseInt(
        DetailMain.localPrice.replace("Rp", "").replace(",", "")
      ),
      permissions_required_reviews: DetailMain.permissionList,
      screenshots_reviews: Screenshot.scrnShtUrlList.map(
        ({ originalScrnShtUrl }) => originalScrnShtUrl
      ),
      location_reviews: null,
      category_reviews: "application",
      total_reviews: parseInt(commentListTotalCount),
      reviews_rating: {
        total_rating: parseFloat(DetailMain.ratingNumber),
        detail_total_rating: null,
      },
    };

    let output = `data/${title}/${id}.json`;
    this.#writeFile(output, headers);

    let i = 1;
    while (true) {
      const reviews = await this.#getReviews(DetailMain.contentId, i);

      if (!reviews) break;
      log.total_data += reviews.length;

      const [modify_date_reviews, modify_date_epoch_reviews] = this.#parseDate(
        DetailMain.modifyDate
      );

      for (const review of reviews) {
        const id = crypto.randomUUID();
        output = `data/${title}/${id}.json`;

        const [created_time, created_time_epoch] = this.#parseDate(
          review.createDate
        );
        const [edited_time, edited_time_epoch] = this.#parseDate(
          review.modifyDate
        );

        try {
          const data = {
            ...headers,
            modify_date_reviews,
            modify_date_epoch_reviews,
            path_data_raw: `data/data_raw/data_review/${domain}/${title}/json/${id}.json`,
            path_data_clean: `data/data_clean/data_review/${domain}/${title}/json/${id}.json`,
            detail_reviews: {
              username_reviews: review.loginId,
              image_reviews: null,
              created_time,
              created_time_epoch,
              edited_time,
              edited_time_epoch,
              email_reviews: null,
              company_name: null,
              location_reviews: null,
              title_detail_reviews: null,
              reviews_rating: parseFloat(
                review.ratingValueNumber
                  .replace("stars rating-stars-", "")
                  .replace("-", ".")
              ),
              detail_reviews_rating: null,
              total_likes_reviews: null,
              total_dislikes_reviews: null,
              total_reply_reviews: null,
              content_reviews: review.commentText,
              reply_content_reviews: null,
              date_of_experience: null,
              date_of_experience_epoch: null,
            },
          };

          log.total_success += 1;
          infoLog(log, id, "success");
          updateLog(log);
        } catch (e) {
          log.total_failed += 1;
          infoLog(log, id, "error", e);
        }
        console.log(output);
      }
      i += 15;
    }
    log.status = "Done";
    updateLog(log);
  }
}

new Galaxystore();

import fs from "fs-extra";
import strftime from "strftime";
import crypto from "crypto";

class Galaxystore {
  #BASE_URL = "https://galaxystore.samsung.com";
  #appId;
  constructor(appId) {
    this.#appId = appId;
    this.#start();
  }

  async writeFile(outputFile, data) {
    await fs.outputFile(outputFile, JSON.stringify(data, null, 2));
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

  async #start() {
    const response = await fetch(`${this.#BASE_URL}/api/detail/${this.#appId}`);

    const { DetailMain, appId, Screenshot, SellerInfo, commentListTotalCount } =
      await response.json();
    const title = DetailMain.contentName;
    const link = `${this.#BASE_URL}/detail/${appId}`;
    const domain = this.#BASE_URL.split("/")[2];

    let i = 1;
    while (true) {
      const reviews = await this.#getReviews(DetailMain.contentId, i);

      if (!reviews) break;

      const [modify_date_reviews, modify_date_epoch_reviews] = this.#parseDate(
        DetailMain.modifyDate
      );

      reviews.forEach(async (review) => {
        const id = crypto.randomUUID();
        const output = `data/${title}/${id}.json`;

        const [created_time, created_time_epoch] = this.#parseDate(
          review.createDate
        );
        const [edited_time, edited_time_epoch] = this.#parseDate(
          review.modifyDate
        );

        await this.writeFile(output, {
          link,
          domain,
          tag: link.split("/").slice(2),
          crawling_time: strftime("%Y-%m-%d %H:%M:%S", new Date()),
          crawling_time_epoch: Date.now(),
          path_data_raw: `data/data_raw/data_review/${domain}/${title}/json/${id}.json`,
          path_data_clean: `data/data_clean/data_review/${domain}/${title}/json/${id}.json`,
          reviews_name: DetailMain.contentName,
          modify_date_reviews,
          modify_date_epoch_reviews,
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
        });
        console.log(output);
      });

      i += 15;
    }
  }
}

// new Galaxystore("com.nexon.bluearchivegalaxy");
new Galaxystore("com.miHoYo.GI.samsung");

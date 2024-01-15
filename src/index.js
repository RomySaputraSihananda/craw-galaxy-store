import fs from "fs-extra";

class Galaxystore {
  #BASE_URL = "https://galaxystore.samsung.com";
  #productId;
  constructor(productId) {
    this.#productId = productId;
    this.#start();
  }

  async writeFile(outputFile, data) {
    await fs.outputFile(outputFile, JSON.stringify(data, null, 2));
  }

  async #getReviews(contentId) {
    const reviews = [];
    let i = 1;

    while (true) {
      const response = await fetch(
        `${this.#BASE_URL}/api/commentList/contentId=${contentId}&startNum=${i}`
      );
      const { commentList } = await response.json();

      if (!commentList.length) break;
      reviews.push(...commentList);

      i += 15;
    }

    return reviews;
  }

  async #start() {
    const response = await fetch(
      `${this.#BASE_URL}/api/detail/${this.#productId}`
    );
    const { DetailMain } = await response.json();

    const reviews = await this.#getReviews(DetailMain.contentId);

    console.log(reviews.length);
  }
}

new Galaxystore("com.nianticlabs.pokemongo.ares");

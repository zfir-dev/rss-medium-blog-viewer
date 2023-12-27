import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import ENV from 'rss-medium-blog-viewer/config/environment'; // Import ENV

export default class ApplicationController extends Controller {
  @tracked selected = null;
  @tracked items = [];

  constructor() {
    super(...arguments);
    this.load();
  }

  @action
  async load() {
    const medium_url = ENV.medium_url;;
    const rss_2_json_api_key = ENV.rss_2_json_api_key;
    try {
      const response = await fetch(
        `https://api.rss2json.com/v1/api.json?rss_url=${medium_url}&api_key=${rss_2_json_api_key}`,
      );
      const data = await response.json();
      data.items.forEach((item, index) => {
        item.id = index;
      });
      console.log(data.items);
      this.items = data.items;
    } catch (error) {
      console.error('Error fetching blog posts:', error);
    }
  }

  @action
  handleSelected(blog) {
    this.selected = blog;
  }

  @action
  handleBack() {
    this.selected = null;
  }
}

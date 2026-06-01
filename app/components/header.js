import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import ENV from 'rss-medium-blog-viewer/config/environment';

export default class HeaderComponent extends Component {
  @tracked iconUrl = ENV.icon_url;
  @tracked mediumUrl = ENV.medium_url;

  get selectedItem() {
    if (this.args.selected === null || this.args.selected === undefined) {
      return null;
    }

    return this.args.items?.[Number(this.args.selected)];
  }

  get link() {
    return this.selectedItem?.link;
  }
}

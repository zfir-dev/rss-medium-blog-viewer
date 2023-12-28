import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import ENV from 'rss-medium-blog-viewer/config/environment';

export default class HeaderComponent extends Component {
  @tracked iconUrl = ENV.icon_url;
  @tracked mediumUrl = ENV.medium_url;

  get link() {
    return this.args.items[this.args.selected].link;
  }
}

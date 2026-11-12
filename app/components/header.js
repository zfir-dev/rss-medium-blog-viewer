import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import ENV from 'rss-medium-blog-viewer/config/environment';

export default class HeaderComponent extends Component {
  // A local ICON_URL (file in public/) must be absolute to load on /posts/...
  @tracked iconUrl =
    ENV.icon_url && !/^([a-z][a-z0-9+.-]*:|\/)/i.test(ENV.icon_url)
      ? `${ENV.rootURL}${ENV.icon_url}`
      : ENV.icon_url;
  @tracked mediumUrl = ENV.medium_url;

  get link() {
    return this.args.items[this.args.selected].link;
  }
}

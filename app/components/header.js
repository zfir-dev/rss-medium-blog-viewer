import Component from '@glimmer/component';
import ENV from 'rss-medium-blog-viewer/config/environment';

export default class HeaderComponent extends Component {
    icon = ENV.icon_url;
}

import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';

export default class BlogComponent extends Component {
  get title() {
    return this.args.item?.title || '';
  }

  get content() {
    return htmlSafe(this.args.item?.content || '');
  }
}

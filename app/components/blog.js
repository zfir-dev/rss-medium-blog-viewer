import Component from '@glimmer/component';
import { action } from '@ember/object';
import { htmlSafe } from '@ember/template';

export default class BlogComponent extends Component {
  get content() {
    return htmlSafe(this.args.item.content);
  }

  @action
  back() {
    this.args.handleBack();
  }
}

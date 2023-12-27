import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class BlogComponent extends Component {
  get content() {
    return this.args.item.content;
  }

  @action
  back() {
    this.args.handleBack();
  }
}

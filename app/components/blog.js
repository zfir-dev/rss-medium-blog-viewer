import Component from '@glimmer/component';
import { action } from '@ember/object';
import { htmlSafe } from '@ember/template';

export default class BlogComponent extends Component {
  get title() {
    return this.args.items[this.args.selected].title;
  }

  get content() {
    return htmlSafe(this.args.items[this.args.selected].content);
  }

  @action
  back() {
    this.args.handleBack();
  }
}

import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class BlogsComponent extends Component {
  get items() {
    return this.args.items || [];
  }

  getFormattedDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  @action
  select(item, event) {
    event?.preventDefault();
    this.args.handleSelected?.(item);
  }
}

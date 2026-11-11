import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class BlogsComponent extends Component {
  getFormattedDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  @action
  select(item, event) {
    // Let the browser handle new-tab/new-window clicks on the real href.
    if (
      event &&
      (event.defaultPrevented ||
        event.button > 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey)
    ) {
      return;
    }
    event?.preventDefault();
    this.args.handleSelected(item);
  }
}

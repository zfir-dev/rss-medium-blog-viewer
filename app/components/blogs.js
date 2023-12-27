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
    select(item) {
        this.args.handleSelected(item);
    }
}

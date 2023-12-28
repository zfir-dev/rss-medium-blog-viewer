import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class FooterComponent extends Component {
    @tracked currentYear = new Date().getFullYear();

    get previousItem() {
        if (this.args.selected === '0') return this.args.items[parseInt(this.args.selected)];
        return this.args.items[parseInt(this.args.selected) - 1];
    }

    get nextItem() {
        if (this.args.selected === (this.args.items.length - 1).toString()) return this.args.items[parseInt(this.args.selected)];
        return this.args.items[parseInt(this.args.selected) + 1];
    }

    @action
    select(item) {
        this.args.handleSelected(item);
    }
}

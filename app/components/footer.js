import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class FooterComponent extends Component {
  @tracked currentYear = new Date().getFullYear();
  @tracked touchStartX = 0;

  get previousItem() {
    return this.args.items[parseInt(this.args.selected) - 1];
  }

  get nextItem() {
    return this.args.items[parseInt(this.args.selected) + 1];
  }

  @action
  select(item) {
    this.args.handleSelected(item);
  }

  @action
  handleKeydown(event) {
    const currentIndex = parseInt(this.args.selected);

    if (event.key === 'ArrowLeft' && currentIndex > 0) {
      this.select(this.args.items[currentIndex - 1]);
    }

    if (
      event.key === 'ArrowRight' &&
      currentIndex < this.args.items.length - 1
    ) {
      this.select(this.args.items[currentIndex + 1]);
    }
  }

  @action
  handleTouchStart(event) {
    this.touchStartX = event.touches[0].clientX;
  }

  @action
  handleTouchEnd(event) {
    const touchEndX = event.changedTouches[0].clientX;
    const deltaX = this.touchStartX - touchEndX;

    if (deltaX > 50) {
      const currentIndex = parseInt(this.args.selected);
      if (currentIndex < this.args.items.length - 1) {
        this.select(this.args.items[currentIndex + 1]);
      }
    } else if (deltaX < -50) {
      const currentIndex = parseInt(this.args.selected);
      if (currentIndex > 0) {
        this.select(this.args.items[currentIndex - 1]);
      }
    }
  }

  @action
  setupListeners() {
    document.body.addEventListener('keydown', this.handleKeydown);
    document.body.addEventListener('touchstart', this.handleTouchStart);
    document.body.addEventListener('touchend', this.handleTouchEnd);
  }

  @action
  removeListeners() {
    document.body.removeEventListener('keydown', this.handleKeydown);
    document.body.removeEventListener('touchstart', this.handleTouchStart);
    document.body.removeEventListener('touchend', this.handleTouchEnd);
  }
}

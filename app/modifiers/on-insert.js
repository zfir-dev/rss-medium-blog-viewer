import Modifier from 'ember-modifier';

export default class OnInsertModifier extends Modifier {
  didRun = false;

  modify(element, [callback]) {
    if (!this.didRun && typeof callback === 'function') {
      callback(element);
      this.didRun = true;
    }
  }
}

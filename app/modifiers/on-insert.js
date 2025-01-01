import Modifier from 'ember-modifier';

export default class OnInsertModifier extends Modifier {
  didRun = false;

  modify(element, [callback]) {
    if (!this.didRun) {
      callback(element);
      this.didRun = true;
    }
  }
}

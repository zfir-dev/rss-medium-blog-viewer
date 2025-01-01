import Modifier from 'ember-modifier';
import { registerDestructor } from '@ember/destroyable';

export default class OnInsertModifier extends Modifier {
  modify(element, [callback]) {
    registerDestructor(this, () => callback());
  }
}

import { or, bool } from '@ember/object/computed';
import EmberObject from '@ember/object';
import { objectAssign } from './utils';
import TaskStateMixin from './-task-state-mixin';
import { propertyModifiers } from './-property-modifiers-mixin';

export const TaskGroup = EmberObject.extend(TaskStateMixin, {
  isTaskGroup: true,

  toString() {
    return `<TaskGroup:${this._propertyName}>`;
  },

  _numRunningOrNumQueued: or('numRunning', 'numQueued'),
  isRunning: bool('_numRunningOrNumQueued'),
  isQueued: false,
});

export class TaskGroupProperty {}

objectAssign(TaskGroupProperty.prototype, propertyModifiers);

import { computed } from '@ember/object';
import { addListener } from '@ember/object/events';
import { addObserver } from '@ember/object/observers';
import { scheduleOnce } from '@ember/runloop';
import Ember from 'ember';
import { gte } from 'ember-compatibility-helpers';
import { all, allSettled, hash, race } from './-cancelable-promise-helpers';
import { resolveScheduler } from './-property-modifiers-mixin';
import { TaskGroup, TaskGroupProperty } from './-task-group';
import { didCancel } from './-task-instance';
import { Task, TaskProperty } from './-task-property';
import { waitForEvent, waitForProperty, waitForQueue } from './-wait-for';
import { forever, timeout } from './utils';

/**
 * A Task is a cancelable, restartable, asynchronous operation that
 * is driven by a generator function. Tasks are automatically canceled
 * when the object they live on is destroyed (e.g. a Component
 * is unrendered).
 *
 * To define a task, use the `task(...)` function, and pass in
 * a generator function, which will be invoked when the task
 * is performed. The reason generator functions are used is
 * that they (like the proposed ES7 async-await syntax) can
 * be used to elegantly express asynchronous, cancelable
 * operations.
 *
 * You can also define an
 * <a href="/#/docs/encapsulated-task">Encapsulated Task</a>
 * by passing in an object that defined a `perform` generator
 * function property.
 *
 * The following Component defines a task called `myTask` that,
 * when performed, prints a message to the console, sleeps for 1 second,
 * prints a final message to the console, and then completes.
 *
 * ```js
 * import { task, timeout } from 'ember-concurrency';
 * export default Component.extend({
 *   myTask: task(function * () {
 *     console.log("Pausing for a second...");
 *     yield timeout(1000);
 *     console.log("Done!");
 *   })
 * });
 * ```
 *
 * ```hbs
 * <button {{action myTask.perform}}>Perform Task</button>
 * ```
 *
 * By default, tasks have no concurrency constraints
 * (multiple instances of a task can be running at the same time)
 * but much of a power of tasks lies in proper usage of Task Modifiers
 * that you can apply to a task.
 *
 * @type {function}
 * @param {function} generatorFunction the generator function backing the task.
 * @returns {TaskProperty}
 */
let task;

if (gte('3.9.0-beta.1')) {
  let handlerCounter = 0;

  const registerOnPrototype = function (
    addListenerOrObserver,
    proto,
    names,
    taskName,
    taskMethod,
    once
  ) {
    if (names) {
      for (let i = 0; i < names.length; ++i) {
        let name = names[i];

        let handlerName = `__ember_concurrency_handler_${handlerCounter++}`;
        proto[handlerName] = makeTaskCallback(taskName, taskMethod, once);
        addListenerOrObserver(proto, name, null, handlerName);
      }
    }
  }

  const makeTaskCallback = function (taskName, method, once) {
    return function () {
      let task = this.get(taskName);

      if (once) {
        scheduleOnce('actions', task, method, ...arguments);
      } else {
        task[method].apply(task, arguments);
      }
    };
  }

  task = function (taskFn) {
    let tp = function () {
      let cp = computed(function (_propertyName) {
        taskFn.displayName = `${_propertyName} (task)`;
        return Task.create({
          fn: taskFn,
          context: this,
          _origin: this,
          _taskGroupPath: tp._taskGroupPath,
          _scheduler: resolveScheduler(tp, this, TaskGroup),
          _propertyName,
          _debug: tp._debug,
          _hasEnabledEvents: tp._hasEnabledEvents,
        });
      });
      let elementDesc = Object.apply.call(cp, cp, arguments);

      tp.eventNames = null;
      tp.cancelEventNames = null;
      tp._observes = null;

      let computedFinisher = elementDesc.finisher;

      elementDesc.finisher = function (klass) {
        computedFinisher(...arguments)

        let obj = klass.prototype !== undefined ? klass.prototype : klass;

        if (tp._maxConcurrency !== Infinity && !tp._hasSetBufferPolicy) {
          // eslint-disable-next-line no-console
          console.warn(
            `The use of maxConcurrency() without a specified task modifier is deprecated and won't be supported in future versions of ember-concurrency. Please specify a task modifier instead, e.g. \`${elementDesc._propertyName}: task(...).enqueue().maxConcurrency(${
            tp._maxConcurrency
            })\``
          );
        }

        registerOnPrototype(
          addListener,
          obj,
          tp.eventNames,
          elementDesc.key,
          'perform',
          false
        );
        registerOnPrototype(
          addListener,
          obj,
          tp.cancelEventNames,
          elementDesc.key,
          'cancelAll',
          false
        );
        registerOnPrototype(
          addObserver,
          obj,
          tp._observes,
          elementDesc.key,
          'perform',
          true
        );
      };

      return elementDesc;
    };

    Object.setPrototypeOf(tp, TaskProperty.prototype);
    Ember._setComputedDecorator(tp);

    return tp;
  }
} else {
  task = function (taskFn) {
    return new TaskProperty(taskFn);
  }
}

/**
 * "Task Groups" provide a means for applying
 * task modifiers to groups of tasks. Once a {@linkcode Task} is declared
 * as part of a group task, modifiers like `drop()` or `restartable()`
 * will no longer affect the individual `Task`. Instead those
 * modifiers can be applied to the entire group.
 *
 * ```js
 * import { task, taskGroup } from 'ember-concurrency';
 *
 * export default Controller.extend({
 *   chores: taskGroup().drop(),
 *
 *   mowLawn:       task(taskFn).group('chores'),
 *   doDishes:      task(taskFn).group('chores'),
 *   changeDiapers: task(taskFn).group('chores')
 * });
 * ```
 * @type {function}
 * @returns {TaskGroup}
 */
let taskGroup;

if (gte('3.9.0-beta.1')) {
  taskGroup = function(taskFn) {
    let tp = function () {
      // let elementDesc =
      computed(function (_propertyName) {
        taskFn.displayName = `${_propertyName} (task)`;
        return TaskGroup.create({
          fn: taskFn,
          context: this,
          _origin: this,
          _taskGroupPath: tp._taskGroupPath,
          _scheduler: resolveScheduler(tp, this, TaskGroup),
          _propertyName,
        });
      })(...arguments);
    };

    Object.setPrototypeOf(tp, TaskGroupProperty.prototype);
    Ember._setComputedDecorator(tp);

    return tp;
  }
} else {
  taskGroup = function (...args) {
    return new TaskGroupProperty(...args);
  }
}

export { all, allSettled, didCancel, hash, race, timeout, waitForQueue, waitForEvent, waitForProperty, forever, task, taskGroup };


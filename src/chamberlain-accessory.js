const _ = require('underscore');
const Api = require('./api');
const instance = require('./instance');

const ACTIVE_DELAY = 1000 * 2;
const IDLE_DELAY = 1000 * 10;

module.exports = class {
  constructor(log, {deviceId, name, password, username}) {
    this.log = log;
    this.api = new Api({deviceId, password, username});

    const {Service, Characteristic} = instance.homebridge.hap;
    const {CurrentDoorState, TargetDoorState} = Characteristic;

    this.apiToHap = {
      1: CurrentDoorState.OPEN,
      2: CurrentDoorState.CLOSED,
      4: CurrentDoorState.OPENING,
      5: CurrentDoorState.CLOSING
    };

    this.hapToApi = {
      [TargetDoorState.OPEN]: 1,
      [TargetDoorState.CLOSED]: 0
    };

    this.hapToEnglish = {
      [CurrentDoorState.OPEN]: 'open',
      [CurrentDoorState.CLOSED]: 'closed',
      [CurrentDoorState.OPENING]: 'opening',
      [CurrentDoorState.CLOSING]: 'closing'
    };

    const service = this.service = new Service.GarageDoorOpener(name);

    this.states = {
      doorstate:
        service
          .getCharacteristic(Characteristic.CurrentDoorState)
          .on('get', this.getValue.bind(this, 'doorstate'))
          .on('change', this.logChange.bind(this, 'doorstate')),
      desireddoorstate:
        service
          .getCharacteristic(Characteristic.TargetDoorState)
          .on('set', this.setValue.bind(this, 'desireddoorstate'))
          .on('change', this.logChange.bind(this, 'desireddoorstate'))
    };

    this.states.doorstate.value = CurrentDoorState.CLOSED;
    this.states.desireddoorstate.value = TargetDoorState.CLOSED;

    (this.poll = this.poll.bind(this))();
  }

  poll() {
    return new Promise((resolve, reject) =>
      this.states.doorstate.getValue(er => er ? reject(er) : resolve())
    ).then(() =>
      this.states.doorstate.value !== this.state.desireddoorstate.value ?
      ACTIVE_DELAY : IDLE_DELAY
    ).catch(_.noop).then((delay = IDLE_DELAY) => setTimeout(this.poll, delay));
  }

  logChange(name, {oldValue, newValue}) {
    const from = this.hapToEnglish[oldValue];
    const to = this.hapToEnglish[newValue];
    this.log(`${name} changed from ${from} to ${to}`);
  }

  getErrorHandler(cb) {
    return er => {
      this.log(er);
      cb(er);
    };
  }

  getValue(name, cb) {
    return this.api.getDeviceAttribute({name})
      .then(value => cb(null, this.apiToHap[value]))
      .catch(this.getErrorHandler(cb));
  }

  setValue(name, value, cb) {
    this.log(`attempting to set ${name} to ${this.hapToEnglish[value]}`);
    value = this.hapToApi[value];
    return this.api.setDeviceAttribute({name, value})
      .then(cb.bind(null, null))
      .catch(this.getErrorHandler(cb));
  }

  getServices() {
    return [this.service];
  }
};

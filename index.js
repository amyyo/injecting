var invariant = require('invariant');
var util = require('./util');
var cachify = util.cachify;
var INJECTOR = "$injector";
var co = require('co');

function cleanObj(context, name) {
  Object
    .keys(context[name] || {})
    .forEach(function(key) {
      obj[key] = null;
    });
  context[name] = {};
}

function Injecting(config) {
    if (!(this instanceof Injecting)) return new Injecting(config);
    var cfg = config || {};
    this._injector = cfg.injectorName || INJECTOR;
    this.context = {};
    this.cache = {};
    this.constant(this._injector, this);
}

function merge(a, b) {
  Object.keys(b).forEach(function(key) { a[key] = b[key] });
}

merge(Injecting.prototype, {
    _checkExist: function (name) {
        var msg = '';
        if (name === this._injector) {
            msg = this._injector + ' is reserved, try use other name';
        }
        invariant(!this.context[name], '%s is already registered. ' + msg, name);
    },

    /**
     * clean the instance for gc.
     */
    destory: function () {
      cleanObj(this, 'context');
      cleanObj(this, 'cache');
    },

    register: function (name, obj) {
        switch (true) {
            case typeof obj === 'function':
                return this.service(name, obj);
            default:
                return this.constant(name, obj);
        }
    },

    service: function (name, constructor) {
        this._checkExist(name);
        this.cache[name] = {}; // generate a namespace
        var app = this;
        this.context[name] = {
            value: cachify(function (_locals) {
                var locals = _locals;
                app._loading = app._loading || {};
                var key = name + this.$key;
                invariant(!app._loading[key], 'circular dependencies found for ' + name);
                app._loading[key] = true;
                var instance;
                try {
                    var inherit = function(){};
                    inherit.prototype = constructor.prototype;
                    instance = new inherit();
                    instance2 = app.invoke(constructor, instance, locals);
                } catch(e) {
                    app._loading[name] = false;
                    return Promise.reject(e);
                }
                // if instance2 is emtpy, return the instance instead.
                return instance2.then(function(i) {
                  return i || instance;
                });
            }, this.cache[name])
        };
    },

    constant: function(name, value) {
        this._checkExist(name);
        this.context[name] = {
            value: function() { return value; }
        };
    },

    invoke: function(func, context, _locals) {
        var args = util.parameters(func);
        if (util.isGeneratorFunction(func)) func = co.wrap(func);
        var app = this;
        var locals = _locals || {};
        try {
          var actuals = args.map(function(arg) {
              return locals[arg] || app.get(arg, locals);
          });
        } catch (e) {
          return Promise.reject(e);
        }
        return Promise.all(actuals).then(function(args) {
          return func.apply(context, args);
        });
    },

    /**
     * make sure it always returns a promise.
     */
    get: function(name, locals) {
        var dep = this.context[name];
        invariant(dep, '%s is not found!', name);
        return Promise.resolve(dep.value(locals || {}));
    }
});
module.exports = Injecting;


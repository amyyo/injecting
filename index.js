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
    this.overwritable = {};
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
        if (this.overwritable['$$' + name]) return;
        if (this.context.hasOwnProperty(name)) throw new Error(name + ' is already registered. ' + msg);
    },

    /**
     * clean the instance for gc.
     */
    destory: function () {
      cleanObj(this, 'context');
      cleanObj(this, 'cache');
    },

    register: function (name, obj, opts) {
        switch (true) {
            case typeof obj === 'function':
                return this.service(name, obj, opts);
            default:
                return this.constant(name, obj, opts);
        }
    },

    service: function (name, constructor, opts) {
        this._checkExist(name);
        this.overwritable['$$' + name] = !!util.get(opts, 'overwritable');
        this.cache[name] = {}; // generate a namespace
        var app = this;
        this.context[name] = {
            value: cachify(function (_locals) {
                var locals = _locals;
                app._loading = app._loading || {};
                if (app._loading[name]) throw new Error('circular dependencies found for ' + name);
                app._loading[name] = true;
                var instance;
                try {
                    instance = app.invoke(constructor, instance, locals);
                } catch(e) {
                    app._loading[name] = false;
                    return Promise.reject(e);
                }
                return instance;
            })
        };
    },

    constant: function (name, value, opts) {
        this._checkExist(name);
        this.overwritable['$$' + name] = !!util.get(opts, 'overwritable');
        this.context[name] = {
            value: function() { return value; }
        };
    },

    invoke: function(func, context, _locals) {
        var args = util.parameters(func);
        var noConstructor = false;
        if (util.isGeneratorFunction(func)) {
          func = co.wrap(func);
          noConstructor = true; // no way to treat generator as constructor
        }
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
          // (arrow function|method function) does not have prototype, it is unable to initantiate
          return (context || noConstructor || !func.prototype) ? func.apply(context, args) : util.newApply(func, args);
        });
    },

    /**
     * make sure it always returns a promise.
     */
    get: function(name, locals) {
        var dep = this.context[name];
        if (!dep) throw new Error(name + ' is not found!');
        return Promise.resolve(dep.value(locals || {}));
    }
});
module.exports = Injecting;


//参考文档：http://underscorejs.org/
//参考文档：http://www.bootcss.com/p/underscore/
/*
  建议：
      1刚开始不要一行一行跟下来敲，先了解一下库的整体结构
      2遇到不懂的打个断点，多看几遍，断点很重要
      3有些内部函数使用频率很高（cb....）,这些内部函数了解清楚了后续看起来轻松不少，

*/
(function() {
  //获取根对象，浏览器是window(self),Node是global,window.window===window返回true,global亦然
  var root = typeof self == 'object' && self.self === self && self ||
            typeof global == 'object' && global.global === global && global ||
            this ||
            {};
  //获取现有的_对象，避免冲突，具体解决冲突方法后面会说
  var previousUnderscore = root._;
  //获取原型对象，为的是写起来方便不用每次都xxx.proto...一大推
  var ArrayProto = Array.prototype, ObjProto = Object.prototype;
  var SymbolProto = typeof Symbol !== 'undefined' ? Symbol.prototype : null;

  var push = ArrayProto.push,
      slice = ArrayProto.slice,
      toString = ObjProto.toString,
      hasOwnProperty = ObjProto.hasOwnProperty;

  var nativeIsArray = Array.isArray,
      nativeKeys = Object.keys,
      nativeCreate = Object.create;
  //中转函数，后面用到会说
  var Ctor = function(){};
  /*
  _的构造函数，
  第一步是看看obj是否是_的实例，如果是就不操作直接返回，有点像$($("#d1")),jq或zepto里也有相似的判断
  第二步是判断this是否是_的实例,不是则进行new 调用，
  注意，在进行new调用的时候 new会做4件事，1创建空对象，2空对象的__proto__指向函数的prototype,3this指向空对象（此时可能会添加属性等），4判断返回值，
  而此时在当前的_里this已经指向空对象
  第三步为当前对象添加_wrapped属性，这是为了后面的链式调用做准备
  */
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  //根据当前环境添加_对象
  if (typeof exports != 'undefined' && !exports.nodeType) {
    if (typeof module != 'undefined' && !module.nodeType && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  }
   else {
    root._ = _;
  }

  // 版本号
  _.VERSION = '1.8.3';

  //下面就是一些常用的方法了，后面会一点一点分析
  // _.each=_.forEach=function(){......}
  //...
  //...
  //...


  /*
  链式函数
  实例化当前对象，设置_china为true,此为判断链式调用属性，true为链式调用
  */
  _.chain = function(obj) {
    var instance = _(obj);
    instance._chain = true;
    return instance;
  };

  //判断是否继续链式调用
  var chainResult = function(instance, obj) {
    return instance._chain ? _(obj).chain() : obj;
  };

  /*
  扩展_的方法 
  第一步遍历obj里所含方法，执行回调
  回调内  
      1获取obj的function,扩展到_里，并保存到func
      2对_的prototype进行扩展,扩展函数里进行取值添加等操作（注意this指向），最后执行func.apply(_, args)（注意apply还有打散数组的功能）把结果和this作为参数传递到chainResult中，判断是否继续链式调用
  第二步 返回_
  
  最后在解释一下为什么_.prototype[name]=function(){....}，如果理解请跳过此段
  大家一般都是_.filter({name:"Mr.zhou"},function(){.....})
  链式调用说白了就是将第一个方法的执行结果作为参数传到第二个方法里，如此依次传递，直到最后一个返回结果；
  想要链式调用常用的_.filter(...)的方法肯定是不行了，具体实现请看例子
  var stooges = [{name: 'curly', age: 25}, {name: 'moe', age: 21}, {name: 'larry', age: 23}];
  var youngest = _.chain(stooges)
                    .sortBy(function(stooge){ return stooge.age; })
                    .value();
  1创建了stooges对象
  2创建youngest变量
  3详细看一下youngest值的计算方法
    3.1先是_.chain(stooges)这句话做了什么呢？（可以回顾一下之前的代码）
      调用_.chain(stooges),内部对_进行实例化，并把stooges作为_wrapped的值，并添加了一个名为_chain值为true的属性，
      最后得到的就是这样一个对象{_wrapped:[{name: 'curly', age: 25}...],_chain:true}
    3.2继续调用
      {_wrapped:[{name: 'curly', age: 25}...],_chain:true}.sortBy(function(stooge){ return stooge.age; })
                                                          .value();
      等等，这样对吗？内个什么对象调用.sortBy不报错吗？它有这个方法吗？
      是有的，你没听错，那么在哪里呢？
      请看_.mixin的这句换_.prototype[name]=function(){....}
      这句话就是在往_的原型对象中添加方法，在这句话之前的_.mixin(_)，与其内部的_.each(_.function(obj),...)就是将_上面的所有方法的地址引用传递给_.prototype上，而{_wrapped:[{name: 'curly', age: 25}...],_chain:true}对象又是_的实例对象，自然也就继承了_.prototype的方法，这也就是链式调用的原理
    3.3最后调用value()来返回它的_wrapped就此结束
    */
  _.mixin = function(obj) {
    _.each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return chainResult(this, func.apply(_, args));
      };
    });
    return _;
  };

  //自调mixin并把_传入
  _.mixin(_);

  // 同mixin差不多添加方法
  _.each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name === 'shift' || name === 'splice') && obj.length === 0) delete obj[0];
      return chainResult(this, obj);
    };
  });

  // 同mixin差不多添加方法
  _.each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return chainResult(this, method.apply(this._wrapped, arguments));
    };
  });

  // _.chain的value方法
  _.prototype.value = function() {
    return this._wrapped;
  };

  //添加相应方法
  _.prototype.valueOf = _.prototype.toJSON = _.prototype.value;
  //添加相应方法
  _.prototype.toString = function() {
    return String(this._wrapped);
  };

  //对AMD的兼容
  if (typeof define == 'function' && define.amd) {
    define('underscore', [], function() {
      return _;
    });
  }
}());

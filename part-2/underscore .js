//参考文档：http://underscorejs.org/
//参考文档：http://www.bootcss.com/p/underscore/
/*
  建议：
       1 刚开始不要一行一行跟下来敲，先了解一下库的整体结构
       2 遇到不懂的打个断点，多跟踪几遍，断点很重要
       3 有些内部函数使用频率很高（cb....）,这些内部函数了解清楚了后续看起来轻松不少
       4 有些函数内，有较多的函数引用，建议多读几遍

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

  //对于cb函数的优化，也是进行this绑定
  var optimizeCb = function(func, context, argCount) {
    //void 0相当于undefined,老版本undefined可以赋值，void 0更为准确
    if (context === void 0) return func;
    //根据argCount传入不同参数
    switch (argCount) {
      //_.sortedIndex,_.times
      case 1: return function(value) {
        return func.call(context, value);
      };
      case null:
      case 3: return function(value, index, collection) {
        return func.call(context, value, index, collection);
      };
      //_.reduce,_.reduceRight
      case 4: return function(accumulator, value, index, collection) {
        return func.call(context, accumulator, value, index, collection);
      };
    }
    //最后进行apply绑定，注意apply可以打散arguments类数组
    return function() {
      return func.apply(context, arguments);
    };
  };

  var builtinIteratee;

  //用于生成可以应用到集合中的每个元素的函数
  var cb = function(value, context, argCount) {
    //尚不清楚这句话有什么用
    if (_.iteratee !== builtinIteratee) return _.iteratee(value, context);
    //返回一个不做任何操作的函数
    if (value == null) return _.identity;
    //如果是函数就进行函数this绑定
    if (_.isFunction(value)) return optimizeCb(value, context, argCount);
    //如果是对象且不是数组，返回一个检测对象属性的函数
    if (_.isObject(value) && !_.isArray(value)) return _.matcher(value);
    //返回一个获取属性值的函数，后面会讲
    return _.property(value);
  };

  /*
  返回了一个用于返回指定属性的函数
  var stooges = [{name: 'curly', age: 25}, {name: 'moe', age: 21}, {name: 'larry', age: 23}];
    _.map(stooges, _.iteratee('age'));
    => [25, 21, 23];
  */
  _.iteratee = builtinIteratee = function(value, context) {
    return cb(value, context, Infinity);
  };

  //创建对象设置原型的函数 Object.create相似
  var baseCreate = function(prototype) {
    if (!_.isObject(prototype)) return {};
    //有原生的就调用原生的nativeCreate
    if (nativeCreate) return nativeCreate(prototype);
    //调用公共的Ctor设置prototype，把Ctor设置外部应该是避免每次调用都会创建新的中转函数
    Ctor.prototype = prototype;
    var result = new Ctor;
    //重置后之前的prototype链依然存在
    Ctor.prototype = null;
    return result;
  };
  //一个闭包函数，返回一个获取固定属性的函数
  var shallowProperty = function(key) {
    return function(obj) {
      return obj == null ? void 0 : obj[key];
    };
  };
  
  //顾名思义，深度获取，接受两个参数，obj源对象,path为属性列表
  var deepGet = function(obj, path) {
    //确定遍历深度
    var length = path.length;
    for (var i = 0; i < length; i++) {
      if (obj == null) return void 0;
      //获取当前对象以便进行下次遍历
      obj = obj[path[i]];
    }
    return length ? obj : void 0;
  };

  //顾名思义，数组的最大长度，跟IOS 8有一定关系
  var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;
  //执行shallowProperty('length')，会得到一个获取length属性的函数
  var getLength = shallowProperty('length');
  //判断类数组，是否含有length（如果是这样{name:1,age:2,length:3},请不要调皮）,length是否是number等其他条件
  var isArrayLike = function(collection) {
    var length = getLength(collection);
    return typeof length == 'number' && length >= 0 && length <= MAX_ARRAY_INDEX;
  };

  /*
  遍历传入的obj,依次对obj里每个值执行所传入的函数，如果传入context,则将传入的iteratee绑定到context上
  */
  _.each = _.forEach = function(obj, iteratee, context) {
    //将传入的iteratee（一般是自己写的对每项值操作的函数）的this绑定到context
    iteratee = optimizeCb(iteratee, context);
    var i, length;
    //如果是类数组，就将值，下标，类数组传入到iteratee调用
    if (isArrayLike(obj)) {
      for (i = 0, length = obj.length; i < length; i++) {
        iteratee(obj[i], i, obj);
      }
    } else {
    //如果是对象，就调用_.keys(),_.keys()后面会讲，大概就是返回一个由对象本身（不含继承的）的属性所组成的数组
      var keys = _.keys(obj);
      //将值，属性，对象传入到iteratee调用
      for (i = 0, length = keys.length; i < length; i++) {
        iteratee(obj[keys[i]], keys[i], obj);
      }
    }
    //返回对象，方便链式调用
    return obj;
  };

  
  /*
  同样是遍历
  */
  _.map = _.collect = function(obj, iteratee, context) {
    //如果有context,将iteratee的this绑定到context上返回
    iteratee = cb(iteratee, context);
    //如果是对象就获取keys数组
    var keys = !isArrayLike(obj) && _.keys(obj),
        //获取length,如果keys有值说明是对象，否则获取obj数组的length，
        length = (keys || obj).length,
        results = Array(length);
    for (var index = 0; index < length; index++) {
      //keys有值返回属性列表里的属性，否则返回下标用于数组，
      var currentKey = keys ? keys[index] : index;
      //将相应地值，下标，对象传入函数中，将结果保存到results中
      results[index] = iteratee(obj[currentKey], currentKey, obj);
    }
    //返回results
    return results;
  };

  //一个不断计算基础值的迭代函数，参数dir判断从头还是从尾开始迭代
  var createReduce = function(dir) {
    //迭代函数的核心
    var reducer = function(obj, iteratee, memo, initial) {
      var keys = !isArrayLike(obj) && _.keys(obj),
          length = (keys || obj).length,
          //获取迭代开始的下标，参数dir在内部传入，1从头，-1从尾
          index = dir > 0 ? 0 : length - 1;
          //根据initial判断memo是否有值，没有则初始化
      if (!initial) {
        //根据keys（可能是数组或对象）来获取下标为index的值
        memo = obj[keys ? keys[index] : index];
        //计算下标，因为上一步已经进行了一次迭代
        index += dir;
      }
      for (; index >= 0 && index < length; index += dir) {
        var currentKey = keys ? keys[index] : index;
        //传入的iteratee必须有返回值，否则memo将为undefined,下次计算将出现错误
        memo = iteratee(memo, obj[currentKey], currentKey, obj);
      }
      //最后返回计算结果
      return memo;
    };
    //_.reduce，_.reduceRight就是此函数，4个参数,迭代对象，迭代函数，基础值，this对象
    return function(obj, iteratee, memo, context) {
      //判断是否含有基础值memo
      var initial = arguments.length >= 3;
      //绑定context,调用reducer
      return reducer(obj, optimizeCb(iteratee, context, 4), memo, initial);
    };
  };

  //调用createReduce(1)，返回一个从左开始向右迭代的方法
  _.reduce = _.foldl = _.inject = createReduce(1);

  // 调用createReduce(-1)返回一个从右侧向左开始迭代的方法
  _.reduceRight = _.foldr = createReduce(-1);

  //根据传入的predicate查找元素，返回找到的第一个值
  _.find = _.detect = function(obj, predicate, context) {
    //根据obj类型，返回一个用于查找数组或者对象的函数，数组函数返回下标，对象函数返回属性名key（_.findIndex， _.findKey后面会讲）
    var keyFinder = isArrayLike(obj) ? _.findIndex : _.findKey;
    var key = keyFinder(obj, predicate, context);
    //判断返回值是否为真，是则返回值
    if (key !== void 0 && key !== -1) return obj[key];
  };


  //根据传入的predicate，筛选出obj中符合条件的值以数组形式返回
  _.filter = _.select = function(obj, predicate, context) {
    //创建空数组，用于存放符合条件的值
    var results = [];
    //如果context!=undefined,返回绑定this的函数,之前说过不在多说，
    predicate = cb(predicate, context);
    _.each(obj, function(value, index, list) {
      //如果符合predicate中的条件，将当前值存放到results中
      if (predicate(value, index, list)) results.push(value);
    });
    return results;
  };
  /*
  //返回一个与你指定条件相反的函数
  var isFalsy = _.negate(Boolean);
  _.find([-2, -1, 0, 1, 2], isFalsy);
  => 0
  */
  _.negate = function(predicate) {
    return function() {
      return !predicate.apply(this, arguments);
    };
  };

  /*
  与_.filter相反，返回不符合条件的值
  var odds = _.reject([1, 2, 3, 4, 5, 6], function(num){ return num % 2 == 0; });
  => [1, 3, 5]
  */
  _.reject = function(obj, predicate, context) {
    //内部调用了_.filter,筛选函数用_.negate取反，而cd(predicate)是判断predicate是否有值
    return _.filter(obj, _.negate(cb(predicate)), context);
  };

  /*
  如果obj中的所有元素都通过predicate的真值检测就返回true
  _.every([true, 1, null, 'yes'], _.identity);
  => false
  原理与_.each等相似不在多说
  */
  _.every = _.all = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      if (!predicate(obj[currentKey], currentKey, obj)) return false;
    }
    return true;
  };

  /*
  如果obj中有任何一个元素通过 predicate 的真值检测就返回true。一旦找到了符合条件的元素, 就直接中断对obj的遍历.
  _.some([null, 0, 'yes', false]);
  => true
  原理与_.each等相似不在多说
  */
  _.some = _.any = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      if (predicate(obj[currentKey], currentKey, obj)) return true;
    }
    return false;
  };
  /*
  返回obj的属性值,也可用于数组
  _.values({one: 1, two: 2, three: 3});
  => [1, 2, 3]
  */
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  /*
  检测obj中是否含有item,fromIndex为检测起始位置，guard这个参数没用过，不过可以看一下，
  只有在判断fromIndex是否符合条件的时候用到了它，而guard又是监视保卫的意思，那大家推断一下？
  _.contains([1, 2, 3], 3);
  => true
  */
  _.contains = _.includes = _.include = function(obj, item, fromIndex, guard) {
    //如果是对象获取属性值，
    if (!isArrayLike(obj)) obj = _.values(obj);
    //判断fromIndex是否符合标准，否则初始化为0
    if (typeof fromIndex != 'number' || guard) fromIndex = 0;
    //调用_.indexOf(与原生相似，后面会讲),根据返回结构判断是否含有指定值
    return _.indexOf(obj, item, fromIndex) >= 0;
  };
  

  /*
  获取对象中的某个值，返回一个数组
  var stooges = [{name: 'moe', age: 40}, {name: 'larry', age: 50}, {name: 'curly', age: 60}];
  _.pluck(stooges, 'name');
  => ["moe", "larry", "curly"]
  结合了_.map和_.property,之前说过不在多说
  */
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  /*
  对象包含所有指定属性则返回true否则false,检查原型链
  var stooge = {name: 'moe', age: 32};
  _.isMatch(stooge, {age: 32});
  => true
  */
  _.isMatch = function(object, attrs) {
    var keys = _.keys(attrs), length = keys.length;
    if (object == null) return !length;
    var obj = Object(object);
    for (var i = 0; i < length; i++) {
      var key = keys[i];
      //如果attrs与obj值不相等或者key不存obj中 返回false
      if (attrs[key] !== obj[key] || !(key in obj)) return false;
    }
    return true;
  };


  //会返回一个用于扩展obj对象的函数，如果值是对象，只是将对象的地址复制给obj
  var createAssigner = function(keysFunc, defaults) {
    //_.extend,_.extendOwn,_.defaults的处理函数，指定obj为待扩展对象
    return function(obj) {
      var length = arguments.length;
      //这句话不太清楚什么意思，
      if (defaults) obj = Object(obj);
      if (length < 2 || obj == null) return obj;
      //遍历arguments
      for (var index = 1; index < length; index++) {
        var source = arguments[index],
            //根据_.keys/_.allKeys来查找key
            keys = keysFunc(source),
            l = keys.length;
        //遍历arguments中当前源对象
        for (var i = 0; i < l; i++) {
          var key = keys[i];
          //!defaults主要用于_.defaults,只有属性是undefined是才进行扩展，_.keys/_.allKeys进行覆盖或扩展
          if (!defaults || obj[key] === void 0) obj[key] = source[key];
        }
      }
      return obj;
    };
  };

  /*
  执行createAssigner，（_.allKeys会将对象上的所有属性包括原型链上的属性以数组的形式返回，后面会讲到）返回一个接收任意参数的函数
  function(obj,source1,source2....){}
  复制source对象中的所有属性覆盖到obj对象上，并且返回obj 对象. 
  复制是按顺序的, 所以后面的对象属性会把前面的对象属性覆盖掉(如果有重复)
  _.extend({name: 'moe'}, {age: 50});
  => {name: 'moe', age: 50}
  */
  _.extend = createAssigner(_.allKeys);

  // Assigns a given object with all the own properties in the passed-in object(s).
  // (https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object/assign)
  
  /*
  执行createAssigner，返回一个接收任意参数的函数
  function(obj,source1,source2....){}
  复制source对象中的本身的属性覆盖到obj对象上，并且返回obj 对象. 
  复制是按顺序的, 所以后面的对象属性会把前面的对象属性覆盖掉(如果有重复)
  */
  _.extendOwn = _.assign = createAssigner(_.keys);


  /*
  用defaults对象填充object中的undefined属性。 并且返回这个object。
  var iceCream = {flavor: "chocolate"};
  _.defaults(iceCream, {flavor: "vanilla", sprinkles: "lots"});
  => {flavor: "chocolate", sprinkles: "lots"}
  */
  _.defaults = createAssigner(_.allKeys, true);

  /*
  返回一个闭包函数，用于检测obj是否含有attrs
  结合_.extendOwn与_.isMatch不在多说
  */
  _.matcher = _.matches = function(attrs) {
    attrs = _.extendOwn({}, attrs);
    return function(obj) {
      return _.isMatch(obj, attrs);
    };
  };

  /*
  遍历obj中的每一个值，返回一个数组，这个数组包含包含attrs所列出的属性的所有的键 - 值对。
  _.where(listOfPlays, {author: "Shakespeare", year: 1611});
  => [{title: "Cymbeline", author: "Shakespeare", year: 1611},
      {title: "The Tempest", author: "Shakespeare", year: 1611}]
  */
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matcher(attrs));
  };

  //遍历obj中的每一个值，返回匹配attrs所列出的属性的所有的键 - 值对的第一个值。
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matcher(attrs));
  };


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
  1 创建stooges对象
  2 创建youngest变量
  3 详细看一下youngest值的计算方法
    3.1 先是_.chain(stooges)这句话做了什么呢？（可以回顾一下之前的代码）
      调用_.chain(stooges),内部对_进行实例化，并把stooges作为_wrapped的值，并添加了一个名为_chain值为true的属性，
      最后得到的就是这样一个对象{_wrapped:[{name: 'curly', age: 25}...],_chain:true}
    3.2 继续调用
      {_wrapped:[{name: 'curly', age: 25}...],_chain:true}.sortBy(function(stooge){ return stooge.age; })
                                                          .value();
      等等，这样对吗？内个什么对象调用.sortBy不报错吗？它有这个方法吗？
      是有的，你没听错，那么在哪里呢？
      请看_.mixin的这句换_.prototype[name]=function(){....}
      这句话就是在往_的原型对象中添加方法，在这句话之前的_.mixin(_)，与其内部的_.each(_.function(obj),...)就是将_上面的所有方法的地址引用传递给_.prototype上，而{_wrapped:[{name: 'curly', age: 25}...],_chain:true}对象又是_的实例对象，自然也就继承了_.prototype的方法，这也就是链式调用的原理
    3.3 最后调用value()来返回它的_wrapped就此结束
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

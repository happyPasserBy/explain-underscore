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

  var restArgs = function(func, startIndex) {
    //根据不同的函数调用，确定参数起始位置startIndex，+可将字符串转为数字类型
    startIndex = startIndex == null ? func.length - 1 : +startIndex;
    return function() {
      //计算出额外参数的length
      var length = Math.max(arguments.length - startIndex, 0),
          rest = Array(length),
          index = 0;
      //将额外的参数保存到rest数组中，在后面调用自定义函数时将rest传入
      for (; index < length; index++) {
        rest[index] = arguments[index + startIndex];
      }
      //根据startIndex不同，所要传入的参数也不同
      switch (startIndex) {
        //
        case 0: return func.call(this, rest);
        // _.difference，_.without
        case 1: return func.call(this, arguments[0], rest);
        // _.invoke
        case 2: return func.call(this, arguments[0], arguments[1], rest);
      }
      var args = Array(startIndex + 1);
      for (index = 0; index < startIndex; index++) {
        args[index] = arguments[index];
      }
      args[startIndex] = rest;
      return func.apply(this, args);
    };
  };
  
  /*
  在obj的每个元素上执行path方法。 任何传递给invoke的额外参数 args，
  invoke都会在调用methodName方法的时候传递给它。
  _.invoke([[5, 1, 7], [3, 2, 1]], 'sort');
  => [[1, 5, 7], [1, 2, 3]]
  */
  _.invoke = restArgs(function(obj, path, args) {
    var contextPath, func;
    if (_.isFunction(path)) {
      func = path;
    } else if (_.isArray(path)) {
      contextPath = path.slice(0, -1);
      path = path[path.length - 1];
    }
    //遍历obj,对每个值执行自定义函数
    return _.map(obj, function(context) {
      var method = func;
      if (!method) {
        if (contextPath && contextPath.length) {
          context = deepGet(context, contextPath);
        }
        if (context == null) return void 0;
        method = context[path];
      }
      return method == null ? method : method.apply(context, args);
    });
  });


  /*
  返回obj中的最大值。如果传递iteratee参数，iteratee将作为obj中每个值的排序依据。如果obj为空，将返回-Infinity
  var stooges = [{name: 'moe', age: 40}, {name: 'larry', age: 50}, {name: 'curly', age: 60}];
  _.max(stooges, function(stooge){ return stooge.age; });
  => {name: 'curly', age: 60};
  */
  _.max = function(obj, iteratee, context) {
    var result = -Infinity, lastComputed = -Infinity,
        value, computed;
    //判断数组是否是由对象组成
    if (iteratee == null || (typeof iteratee == 'number' && typeof obj[0] != 'object') && obj != null) {
      obj = isArrayLike(obj) ? obj : _.values(obj);
      //进行遍历获取最大值
      for (var i = 0, length = obj.length; i < length; i++) {
        value = obj[i];
        if (value != null && value > result) {
          result = value;
        }
      }
    } else {
      iteratee = cb(iteratee, context);
      _.each(obj, function(v, index, list) {
        computed = iteratee(v, index, list);
        //注意 || &&的优先级，
        if (computed > lastComputed || computed === -Infinity && result === -Infinity) {
          result = v;
          lastComputed = computed;
        }
      });
    }
    return result;
  };

  //返回obj中的最小值，与_.max相似
  _.min = function(obj, iteratee, context) {
    var result = Infinity, lastComputed = Infinity,
        value, computed;
    if (iteratee == null || (typeof iteratee == 'number' && typeof obj[0] != 'object') && obj != null) {
      obj = isArrayLike(obj) ? obj : _.values(obj);
      for (var i = 0, length = obj.length; i < length; i++) {
        value = obj[i];
        if (value != null && value < result) {
          result = value;
        }
      }
    } else {
      iteratee = cb(iteratee, context);
      _.each(obj, function(v, index, list) {
        computed = iteratee(v, index, list);
        if (computed < lastComputed || computed === Infinity && result === Infinity) {
          result = v;
          lastComputed = computed;
        }
      });
    }
    return result;
  };

  //获取min与max之间的随机数
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  /*
  从 obj中产生一个随机样本。传递一个数字表示从obj中返回n个随机元素。否则将返回一个单一的随机项。
  _.sample([1, 2, 3, 4, 5, 6], 3);
  => [1, 6, 2]
  */
  _.sample = function(obj, n, guard) {
    //没有n就随机一个
    if (n == null || guard) {
      if (!isArrayLike(obj)) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    var sample = isArrayLike(obj) ? _.clone(obj) : _.values(obj);
    var length = getLength(sample);
    //防止n大于obj的长度
    n = Math.max(Math.min(n, length), 0);
    var last = length - 1;
    //此处为打乱数组顺序
    for (var index = 0; index < n; index++) {
      var rand = _.random(index, last);
      var temp = sample[index];
      sample[index] = sample[rand];
      sample[rand] = temp;
    }
    //截取打乱后的数组
    return sample.slice(0, n);
  };

  //回一个随机乱序的obj副本
  _.shuffle = function(obj) {
    return _.sample(obj, Infinity);
  };

  /*
  返回一个排序后的list拷贝副本。如果传递iteratee参数，iteratee将作为list中每个值的排序依据。
  迭代器也可以是字符串的属性的名称进行排序的(比如 length)
  _.sortBy([1, 2, 3, 4, 5, 6])
  => [1, 2, 3, 4, 5, 6]
  */
  _.sortBy = function(obj, iteratee, context) {
    var index = 0;
    iteratee = cb(iteratee, context);
    return _.pluck(_.map(obj, function(value, key, list) {
      return {
        value: value,
        index: index++,
        criteria: iteratee(value, key, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

   //用于分组的闭包函数
  var group = function(behavior, partition) {
    return function(obj, iteratee, context) {
      //根据partition，返回不同结构
      var result = partition ? [[], []] : {};
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index) {
        //根据传入的回调确定筛选值
        var key = iteratee(value, index, obj);
        //执行分组函数
        behavior(result, value, key);
      });
      return result;
    };
  };

  /*
  把一个集合分组为多个集合，通过 iterator 返回的结果进行分组. 如果 iterator 是一个字符串而不是函数, 
  那么将使用 iterator 作为各元素的属性名来对比进行分组.
  _.groupBy([1.3, 2.1, 2.4], function(num){ return Math.floor(num); });
  => {1: [1.3], 2: [2.1, 2.4]}
  */
  _.groupBy = group(function(result, value, key) {
    //result为{}结构，有则push,无则添加
    if (_.has(result, key)) result[key].push(value); else {result[key] = [value]};
  });

  /*
  给定一个list，和 一个用来返回一个在列表中的每个元素键 的iterator 函数（或属性名）， 返回一个每一项索引的对象。
  和groupBy非常像，但是当你知道你的键是唯一的时候可以使用indexBy
  var stooges = [{name: 'moe', age: 40}, {name: 'larry', age: 50}, {name: 'curly', age: 60}];
  _.indexBy(stooges, 'age');
  => {
    "40": {name: 'moe', age: 40},
    "50": {name: 'larry', age: 50},
    "60": {name: 'curly', age: 60}
  }
  */
  _.indexBy = group(function(result, value, key) {
    result[key] = value;
  });

  /*
  排序一个列表组成一个组，并且返回各组中的对象的数量的计数。类似groupBy，但是不是返回列表的值，
  而是返回在该组中值的数目
  _.countBy([1, 2, 3, 4, 5], function(num) {
    return num % 2 == 0 ? 'even': 'odd';
  });
  => {odd: 3, even: 2}
  */
  _.countBy = group(function(result, value, key) {
    if (_.has(result, key)) result[key]++; else result[key] = 1;
  });
  
  /*
  拆分一个数组（array）为两个数组： 第一个数组其元素都满足predicate迭代函数， 
  而第二个的所有元素均不能满足predicate迭代函数
  _.partition([0, 1, 2, 3, 4, 5], isOdd);
  => [[1, 3, 5], [0, 2, 4]]
  */
  _.partition = group(function(result, value, pass) {
    result[pass ? 0 : 1].push(value);
  }, true);
  
  //跟utf-16有关，感兴趣的可以查一下
  var reStrSymbol = /[^\ud800-\udfff]|[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g;
  /*
  将obj转换成一个数组
  */
  _.toArray = function(obj) {
    if (!obj) {return []};
    if (_.isArray(obj)) return slice.call(obj);
    if (_.isString(obj)) {
      return obj.match(reStrSymbol);
    }
    if (isArrayLike(obj)) return _.map(obj, _.identity);
    return _.values(obj);
  };

  //获取obj长度
  _.size = function(obj) {
    if (obj == null) return 0;
    return isArrayLike(obj) ? obj.length : _.keys(obj).length;
  };


  //数组相关函数
  //******************接下来讲过的函数注释会逐渐减少，建议遇到问题打个debug,跟踪一下，会便于理解**********************************************

  /*
  返回数组中除了最后一个元素外的其他全部元素。传递 n参数将从结果中排除从最后一个开始的n个元素
  _.initial([5, 4, 3, 2, 1]);
  => [5, 4, 3, 2]
  */
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, Math.max(0, array.length - (n == null || guard ? 1 : n)));
  };

  /*
  返回array（数组）的第一个元素。传递 n参数将返回数组中从第一个元素开始的n个元素
  _.first([5, 4, 3, 2, 1]);
  => 5
  */ 
   _.first = _.head = _.take = function(array, n, guard) {
    if (array == null || array.length < 1) return void 0;
    if (n == null || guard) return array[0];
    //巧用_.initial
    return _.initial(array, array.length - n);
  };


  /*
  与_.initial相反
  _.last([5, 4, 3, 2, 1]);
  => 1
  */
  _.last = function(array, n, guard) {
    if (array == null || array.length < 1) return void 0;
    if (n == null || guard) return array[array.length - 1];
    return _.rest(array, Math.max(0, array.length - n));
  };

  /*
  与_.first相反
  _.rest([5, 4, 3, 2, 1]);
  => [4, 3, 2, 1]
  */
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, n == null || guard ? 1 : n);
  };

  /*
  返回一个除去所有false值的 array副本, false, null, 0，-0, "", undefined 和 NaN 都是false值.
  _.compact([0, 1, false, 2, '', 3]);
  => [1, 2, 3]
  */
  _.compact = function(array) {
    return _.filter(array, Boolean);
  };

  /*
  用于数组降维的递归函数
  */
  var flatten = function(input, shallow, strict, output) {
    output = output || [];
    var idx = output.length;
    //遍历当前层
    for (var i = 0, length = getLength(input); i < length; i++) {
      var value = input[i];
      if (isArrayLike(value) && (_.isArray(value) || _.isArguments(value))) {
        //只展开一层
        if (shallow) {
          var j = 0, len = value.length;
          while (j < len) output[idx++] = value[j++];
        } else {
        //递归调用，将多维数组转为一维数组，将output作为参数传递，传递的只是地址，操作的是同一个output
          flatten(value, shallow, strict, output);
          //从新获取长度
          idx = output.length;
        }
      } else if (!strict) {
        output[idx++] = value;
      }
    }
    return output;
  };

  /*
  将一个嵌套多层的数组 array（数组） (嵌套可以是任何层数)转换为只有一层的数组。 如果你传递 shallow参数，数组将只减少一维的嵌套
  _.flatten([1, [2], [3, [[4]]]]);
  => [1, 2, 3, 4];
  */
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, false);
  };

  /*
  类似于without，但返回的值来自array参数数组，并且不存在于other 数组
  _.difference(array, *others)
  _.difference([1, 2, 3, 4, 5], [5, 2, 10]);
  => [1, 3, 4]
  */
  _.difference = restArgs(function(array, rest) {
    //others可能是多维数组，将others转为一维数组
    rest = flatten(rest, true, true);
    //从array中筛选出不存在rest中的值
    return _.filter(array, function(value){
      return !_.contains(rest, value);
    });
  });

  /*
  返回一个删除所有values值后的 array副本
  _.without([1, 2, 1, 0, 3, 1, 4], 0, 1);
  => [2, 3, 4]
  */
  _.without = restArgs(function(array, otherArrays) {
    return _.difference(array, otherArrays);
  });



  /*
  返回 array去重后的副本, 使用 === 做相等测试. 如果您确定 array 已经排序, 那么给 isSorted 参数传递 true值, 此函数将运行的更快的算法.
  如果要处理对象数组([{},{}]), 传参 iterator 来获取要对比的属性
  _.uniq([1, 2, 1, 3, 1, 4]);
  => [1, 2, 3, 4]
  */
  _.uniq = _.unique = function(array, isSorted, iteratee, context) {
    //此处判断是防止isSorted没传，后边参数补齐错位，_.uniq([],function(){..},{})
    if (!_.isBoolean(isSorted)) {
      context = iteratee;
      iteratee = isSorted;
      isSorted = false;
    }
    if (iteratee != null) iteratee = cb(iteratee, context);
    var result = [];
    var seen = [];
    for (var i = 0, length = getLength(array); i < length; i++) {
      var value = array[i],
          computed = iteratee ? iteratee(value, i, array) : value;
      //判断前后两个临近值是否相等
      if (isSorted) {
        if (!i || seen !== computed) result.push(value);
        seen = computed;
      } else if (iteratee) {
        //针对于[{},{}],判断是否重复
        if (!_.contains(seen, computed)) {
          seen.push(computed);
          result.push(value);
        }
      } else if (!_.contains(result, value)) {
        //针对于[],判断是否重复
        result.push(value);
      }
    }
    return result;
  };

  /*
  返回传入的 arrays（数组）并集：按顺序返回，返回数组的元素是唯一的，可以传入一个或多个 arrays
  _.union([1, 2, 3], [101, 2, 1, 10], [2, 1]);
  => [1, 2, 3, 101, 10]
  */
  _.union = restArgs(function(arrays) {
    return _.uniq(flatten(arrays, true, true));
  });

  /*
  返回传入 arrays（数组）交集。结果中的每个值是存在于传入的每个arrays（数组）里
  _.intersection([1, 2, 3], [101, 2, 1, 10], [2, 1]);
  => [1, 2] 
  */
  _.intersection = function(array) {
    var result = [];
    //array是声明的第一个参数，arguments.length则是获取所有参数的个数（声明或未声明）
    var argsLength = arguments.length;
    //用于检测交集，检测arguments中的任何一个都可以，此处是第一个
    for (var i = 0, length = getLength(array); i < length; i++) {
      var item = array[i];
      //如果result有当前值，就跳过
      if (_.contains(result, item)) continue;
      var j;
      //检测所有数组是否含有当前值
      for (j = 1; j < argsLength; j++) {
        if (!_.contains(arguments[j], item)) break;
      }
      //如果j等于argsLength说明所有数组检测完毕，进行push
      if (j === argsLength) result.push(item);
    }
    return result;
  };


  /*
  返回一个根据下标进行重组后的数组
  _.unzip([["moe", 30, true], ["larry", 40, false], ["curly", 50, false]]);
  => [['moe', 'larry', 'curly'], [30, 40, 50], [true, false, false]]
  */
  _.unzip = function(array) {
    var length = array && _.max(array, getLength).length || 0;
    var result = Array(length);

    for (var index = 0; index < length; index++) {
      result[index] = _.pluck(array, index);
    }
    return result;
  };

  //与_.unzip相似
  _.zip = restArgs(_.unzip);

  /*
  将数组转换为对象。传递任何一个单独[key, value]对的列表，或者一个键的列表和一个值得列表。 如果存在重复键，最后一个值将被返回
  _.object(['moe', 'larry', 'curly'], [30, 40, 50]);
  => {moe: 30, larry: 40, curly: 50}
  _.object([['moe', 30], ['larry', 40], ['curly', 50]]);
  => {moe: 30, larry: 40, curly: 50}
  */
  _.object = function(list, values) {
    var result = {};
    for (var i = 0, length = getLength(list); i < length; i++) {
      //根据values判断参数结构
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  //闭包函数，跟句dir不同，决定从左侧或右侧查找
  var createPredicateIndexFinder = function(dir) {
    return function(array, predicate, context) {
      predicate = cb(predicate, context);
      var length = getLength(array);
      //判断从左还是从右
      var index = dir > 0 ? 0 : length - 1;
      for (; index >= 0 && index < length; index += dir) {
        //符合条件返回下标
        if (predicate(array[index], index, array)) return index;
      }
      return -1;
    };
  };

  /*
  从左侧开始根据predicate从array中筛选出符合条件的值，返回其下标，predicate返回true则中断查找，没有则返回-1
  _.findIndex(array, predicate, [context]) 
  _.findIndex([4, 6, 8, 5,12], function(v){return v%2!==0});
  */
  _.findIndex = createPredicateIndexFinder(1);
  //从右侧开始，与 _.findIndex相似
  _.findLastIndex = createPredicateIndexFinder(-1);

  /*
  使用二分查找确定obj在已经排序好的array中的位置序号， obj按此序号插入能保持array原有的排序。 如果提供iteratee函数，
  iteratee将作为array排序的依据，包括你传递的 obj 
  var stooges = [{name: 'moe', age: 40}, {name: 'curly', age: 60}];
  _.sortedIndex(stooges, {name: 'larry', age: 50}, 'age');
  => 1
  */ 
  _.sortedIndex = function(array, obj, iteratee, context) {
    iteratee = cb(iteratee, context, 1);
    var value = iteratee(obj);
    var low = 0, high = getLength(array);
    //二分查找
    while (low < high) {
      var mid = Math.floor((low + high) / 2);
      if (iteratee(array[mid]) < value) low = mid + 1; else high = mid;
    }
    return low;
  };

  //
  var createIndexFinder = function(dir, predicateFind, sortedIndex) {
    return function(array, item, idx) {
      var i = 0, length = getLength(array);
      //判断是否用下标查找
      if (typeof idx == 'number') {
        //判断从左还是从右开始查找_.indexOf/_.lastIndexOf
        //idx可正可负
        if (dir > 0) {
          //_.indexOf 计算查找起始位置
          i = idx >= 0 ? idx : Math.max(idx + length, i);
        } else {
          //_.lastIndexOf 计算查找起始位置
          length = idx >= 0 ? Math.min(idx + 1, length) : idx + length + 1;
        }
      } else if (sortedIndex && idx && length) {
      //判断是否使用二分查找
        idx = sortedIndex(array, item);
        return array[idx] === item ? idx : -1;
      }
      //判断是否是NaN
      if (item !== item) {
        //从起始位置截取到尾部数组，依次判断为NaN的值
        idx = predicateFind(slice.call(array, i, length), _.isNaN);
        return idx >= 0 ? idx + i : -1;
      }
      //idx = dir > 0 ? i : length - 1此三元判断从左还是右开始遍历，
      for (idx = dir > 0 ? i : length - 1; idx >= 0 && idx < length; idx += dir) {
        if (array[idx] === item) return idx;
      }
      return -1;
    };
  };

  /*
  _.indexOf(array, value, [isSorted]) 
  返回value在该 array 中的索引值，如果value不存在 array中就返回-1。使用原生的indexOf 函数，除非它失效。如果您正在使用一个大数组，你知道数组已经排序，
  传递true给isSorted将更快的用二进制搜索..,或者，传递一个数字作为第三个参数，为了在给定的索引的数组中寻找第一个匹配值。
  _.indexOf([1, 2, 3], 2);
  => 1
  */
  _.indexOf = createIndexFinder(1, _.findIndex, _.sortedIndex);
  //与_.indexOf功能相反，从左往右，实现原理相似
  _.lastIndexOf = createIndexFinder(-1, _.findLastIndex);

  /*
  一个用来创建整数灵活编号的列表的函数，便于each 和 map循环。如果省略start则默认为 0；step 默认为 1.返回一个从start 到stop的整数的列表，
  用step来增加 （或减少）独占。值得注意的是，如果stop值在start前面（也就是stop值小于start值），那么值域会被认为是零长度，而不是负增长。
  -如果你要一个负数的值域 ，请使用负数step
  _.range(0, 30, 5);
  => [0, 5, 10, 15, 20, 25]
  */
  _.range = function(start, stop, step) {
    //如果没传stop则stop=start,start=0
    if (stop == null) {
      stop = start || 0;
      start = 0;
    }
    //如果没传stop则判断递增或递减
    if (!step) {
      step = stop < start ? -1 : 1;
    }
    //计算循环次数
    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var range = Array(length);
    //循环，start也要不断计算，以便赋值
    for (var idx = 0; idx < length; idx++, start += step) {
      range[idx] = start;
    }

    return range;
  };

  /*
  用于切割数组,array为源数组，count为切割间距
  _.chunk([1,2,3,4,5,6],2)
  => [[1,2],[3,4],[5,6]]
  */
  _.chunk = function(array, count) {
    //防止count为空
    if (count == null || count < 1) return [];

    var result = [];
    var i = 0, length = array.length;
    while (i < length) {
      //循环切割时不断叠加i来计算当前切割位置与个数，
      result.push(slice.call(array, i, i += count));
    }
    return result;
  };

  // Function (ahem) Functions
  // ------------------

  // Determines whether to execute a function as a constructor
  // or a normal function with the provided arguments.
  var executeBound = function(sourceFunc, boundFunc, context, callingContext, args) {
    if (!(callingContext instanceof boundFunc)) return sourceFunc.apply(context, args);
    var self = baseCreate(sourceFunc.prototype);
    var result = sourceFunc.apply(self, args);
    if (_.isObject(result)) return result;
    return self;
  };

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = restArgs(function(func, context, args) {
    if (!_.isFunction(func)) throw new TypeError('Bind must be called on a function');
    var bound = restArgs(function(callArgs) {
      return executeBound(func, bound, context, this, args.concat(callArgs));
    });
    return bound;
  });

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder by default, allowing any combination of arguments to be
  // pre-filled. Set `_.partial.placeholder` for a custom placeholder argument.
  _.partial = restArgs(function(func, boundArgs) {
    var placeholder = _.partial.placeholder;
    var bound = function() {
      var position = 0, length = boundArgs.length;
      var args = Array(length);
      for (var i = 0; i < length; i++) {
        args[i] = boundArgs[i] === placeholder ? arguments[position++] : boundArgs[i];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return executeBound(func, bound, this, this, args);
    };
    return bound;
  });

  _.partial.placeholder = _;

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  _.bindAll = restArgs(function(obj, keys) {
    keys = flatten(keys, false, false);
    var index = keys.length;
    if (index < 1) throw new Error('bindAll must be passed function names');
    while (index--) {
      var key = keys[index];
      obj[key] = _.bind(obj[key], obj);
    }
  });

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memoize = function(key) {
      var cache = memoize.cache;
      var address = '' + (hasher ? hasher.apply(this, arguments) : key);
      if (!_.has(cache, address)) cache[address] = func.apply(this, arguments);
      return cache[address];
    };
    memoize.cache = {};
    return memoize;
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = restArgs(function(func, wait, args) {
    return setTimeout(function() {
      return func.apply(null, args);
    }, wait);
  });

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = _.partial(_.delay, _, 1);

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var timeout, context, args, result;
    var previous = 0;
    if (!options) options = {};

    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      if (!timeout) context = args = null;
    };

    var throttled = function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0 || remaining > wait) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        previous = now;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };

    throttled.cancel = function() {
      clearTimeout(timeout);
      previous = 0;
      timeout = context = args = null;
    };

    return throttled;
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, result;

    var later = function(context, args) {
      timeout = null;
      if (args) result = func.apply(context, args);
    };

    var debounced = restArgs(function(args) {
      if (timeout) clearTimeout(timeout);
      if (immediate) {
        var callNow = !timeout;
        timeout = setTimeout(later, wait);
        if (callNow) result = func.apply(this, args);
      } else {
        timeout = _.delay(later, wait, this, args);
      }
      return result;
    });

    debounced.cancel = function() {
      clearTimeout(timeout);
      timeout = null;
    };

    return debounced;
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var args = arguments;
    var start = args.length - 1;
    return function() {
      var i = start;
      var result = args[start].apply(this, arguments);
      while (i--) result = args[i].call(this, result);
      return result;
    };
  };

  // Returns a function that will only be executed on and after the Nth call.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Returns a function that will only be executed up to (but not including) the Nth call.
  _.before = function(times, func) {
    var memo;
    return function() {
      if (--times > 0) {
        memo = func.apply(this, arguments);
      }
      if (times <= 1) func = null;
      return memo;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = _.partial(_.before, 2);

  _.restArgs = restArgs;

  // Object Functions
  // ----------------

  // Keys in IE < 9 that won't be iterated by `for key in ...` and thus missed.
  var hasEnumBug = !{toString: null}.propertyIsEnumerable('toString');
  var nonEnumerableProps = ['valueOf', 'isPrototypeOf', 'toString',
                      'propertyIsEnumerable', 'hasOwnProperty', 'toLocaleString'];

  var collectNonEnumProps = function(obj, keys) {
    var nonEnumIdx = nonEnumerableProps.length;
    var constructor = obj.constructor;
    var proto = _.isFunction(constructor) && constructor.prototype || ObjProto;

    // Constructor is a special case.
    var prop = 'constructor';
    if (_.has(obj, prop) && !_.contains(keys, prop)) keys.push(prop);

    while (nonEnumIdx--) {
      prop = nonEnumerableProps[nonEnumIdx];
      if (prop in obj && obj[prop] !== proto[prop] && !_.contains(keys, prop)) {
        keys.push(prop);
      }
    }
  };

  // Retrieve the names of an object's own properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`.
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    // Ahem, IE < 9.
    if (hasEnumBug) collectNonEnumProps(obj, keys);
    return keys;
  };

  // Retrieve all the property names of an object.
  _.allKeys = function(obj) {
    if (!_.isObject(obj)) return [];
    var keys = [];
    for (var key in obj) keys.push(key);
    // Ahem, IE < 9.
    if (hasEnumBug) collectNonEnumProps(obj, keys);
    return keys;
  };


  // Returns the results of applying the iteratee to each element of the object.
  // In contrast to _.map it returns an object.
  _.mapObject = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    var keys = _.keys(obj),
        length = keys.length,
        results = {};
    for (var index = 0; index < length; index++) {
      var currentKey = keys[index];
      results[currentKey] = iteratee(obj[currentKey], currentKey, obj);
    }
    return results;
  };

  // Convert an object into a list of `[key, value]` pairs.
  // The opposite of _.object.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`.
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };


  // Returns the first key on an object that passes a predicate test.
  _.findKey = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = _.keys(obj), key;
    for (var i = 0, length = keys.length; i < length; i++) {
      key = keys[i];
      if (predicate(obj[key], key, obj)) return key;
    }
  };

  // Internal pick helper function to determine if `obj` has key `key`.
  var keyInObj = function(value, key, obj) {
    return key in obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = restArgs(function(obj, keys) {
    var result = {}, iteratee = keys[0];
    if (obj == null) return result;
    if (_.isFunction(iteratee)) {
      if (keys.length > 1) iteratee = optimizeCb(iteratee, keys[1]);
      keys = _.allKeys(obj);
    } else {
      iteratee = keyInObj;
      keys = flatten(keys, false, false);
      obj = Object(obj);
    }
    for (var i = 0, length = keys.length; i < length; i++) {
      var key = keys[i];
      var value = obj[key];
      if (iteratee(value, key, obj)) result[key] = value;
    }
    return result;
  });

  // Return a copy of the object without the blacklisted properties.
  _.omit = restArgs(function(obj, keys) {
    var iteratee = keys[0], context;
    if (_.isFunction(iteratee)) {
      iteratee = _.negate(iteratee);
      if (keys.length > 1) context = keys[1];
    } else {
      keys = _.map(flatten(keys, false, false), String);
      iteratee = function(value, key) {
        return !_.contains(keys, key);
      };
    }
    return _.pick(obj, iteratee, context);
  });


  // Creates an object that inherits from the given prototype object.
  // If additional properties are provided then they will be added to the
  // created object.
  _.create = function(prototype, props) {
    var result = baseCreate(prototype);
    if (props) _.extendOwn(result, props);
    return result;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };



  // Internal recursive comparison function for `isEqual`.
  var eq, deepEq;
  eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a === 1 / b;
    // `null` or `undefined` only equal to itself (strict comparison).
    if (a == null || b == null) return false;
    // `NaN`s are equivalent, but non-reflexive.
    if (a !== a) return b !== b;
    // Exhaust primitive checks
    var type = typeof a;
    if (type !== 'function' && type !== 'object' && typeof b != 'object') return false;
    return deepEq(a, b, aStack, bStack);
  };

  // Internal recursive comparison function for `isEqual`.
  deepEq = function(a, b, aStack, bStack) {
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className !== toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, regular expressions, dates, and booleans are compared by value.
      case '[object RegExp]':
      // RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return '' + a === '' + b;
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive.
        // Object(NaN) is equivalent to NaN.
        if (+a !== +a) return +b !== +b;
        // An `egal` comparison is performed for other numeric values.
        return +a === 0 ? 1 / +a === 1 / b : +a === +b;
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a === +b;
      case '[object Symbol]':
        return SymbolProto.valueOf.call(a) === SymbolProto.valueOf.call(b);
    }

    var areArrays = className === '[object Array]';
    if (!areArrays) {
      if (typeof a != 'object' || typeof b != 'object') return false;

      // Objects with different constructors are not equivalent, but `Object`s or `Array`s
      // from different frames are.
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(_.isFunction(aCtor) && aCtor instanceof aCtor &&
                               _.isFunction(bCtor) && bCtor instanceof bCtor)
                          && ('constructor' in a && 'constructor' in b)) {
        return false;
      }
    }
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.

    // Initializing stack of traversed objects.
    // It's done here since we only need them for objects and arrays comparison.
    aStack = aStack || [];
    bStack = bStack || [];
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] === a) return bStack[length] === b;
    }

    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);

    // Recursively compare objects and arrays.
    if (areArrays) {
      // Compare array lengths to determine if a deep comparison is necessary.
      length = a.length;
      if (length !== b.length) return false;
      // Deep compare the contents, ignoring non-numeric properties.
      while (length--) {
        if (!eq(a[length], b[length], aStack, bStack)) return false;
      }
    } else {
      // Deep compare objects.
      var keys = _.keys(a), key;
      length = keys.length;
      // Ensure that both objects contain the same number of properties before comparing deep equality.
      if (_.keys(b).length !== length) return false;
      while (length--) {
        // Deep compare each member
        key = keys[length];
        if (!(_.has(b, key) && eq(a[key], b[key], aStack, bStack))) return false;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return true;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (isArrayLike(obj) && (_.isArray(obj) || _.isString(obj) || _.isArguments(obj))) return obj.length === 0;
    return _.keys(obj).length === 0;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) === '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    var type = typeof obj;
    return type === 'function' || type === 'object' && !!obj;
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp, isError, isMap, isWeakMap, isSet, isWeakSet.
  _.each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp', 'Error', 'Symbol', 'Map', 'WeakMap', 'Set', 'WeakSet'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) === '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE < 9), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return _.has(obj, 'callee');
    };
  }

  // Optimize `isFunction` if appropriate. Work around some typeof bugs in old v8,
  // IE 11 (#1621), Safari 8 (#1929), and PhantomJS (#2236).
  var nodelist = root.document && root.document.childNodes;
  if (typeof /./ != 'function' && typeof Int8Array != 'object' && typeof nodelist != 'function') {
    _.isFunction = function(obj) {
      return typeof obj == 'function' || false;
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return !_.isSymbol(obj) && isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`?
  _.isNaN = function(obj) {
    return _.isNumber(obj) && isNaN(obj);
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) === '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, path) {
    if (!_.isArray(path)) {
      return obj != null && hasOwnProperty.call(obj, path);
    }
    var length = path.length;
    for (var i = 0; i < length; i++) {
      var key = path[i];
      if (obj == null || !hasOwnProperty.call(obj, key)) {
        return false;
      }
      obj = obj[key];
    }
    return !!length;
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iteratees.
  _.identity = function(value) {
    return value;
  };

  // Predicate-generating functions. Often useful outside of Underscore.
  _.constant = function(value) {
    return function() {
      return value;
    };
  };

  _.noop = function(){};

  _.property = function(path) {
    if (!_.isArray(path)) {
      return shallowProperty(path);
    }
    return function(obj) {
      return deepGet(obj, path);
    };
  };

  // Generates a function for a given object that returns a given property.
  _.propertyOf = function(obj) {
    if (obj == null) {
      return function(){};
    }
    return function(path) {
      return !_.isArray(path) ? obj[path] : deepGet(obj, path);
    };
  };


  // Run a function **n** times.
  _.times = function(n, iteratee, context) {
    var accum = Array(Math.max(0, n));
    iteratee = optimizeCb(iteratee, context, 1);
    for (var i = 0; i < n; i++) accum[i] = iteratee(i);
    return accum;
  };


  // A (possibly faster) way to get the current timestamp as an integer.
  _.now = Date.now || function() {
    return new Date().getTime();
  };

  // List of HTML entities for escaping.
  var escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '`': '&#x60;'
  };
  var unescapeMap = _.invert(escapeMap);

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  var createEscaper = function(map) {
    var escaper = function(match) {
      return map[match];
    };
    // Regexes for identifying a key that needs to be escaped.
    var source = '(?:' + _.keys(map).join('|') + ')';
    var testRegexp = RegExp(source);
    var replaceRegexp = RegExp(source, 'g');
    return function(string) {
      string = string == null ? '' : '' + string;
      return testRegexp.test(string) ? string.replace(replaceRegexp, escaper) : string;
    };
  };
  _.escape = createEscaper(escapeMap);
  _.unescape = createEscaper(unescapeMap);

  // Traverses the children of `obj` along `path`. If a child is a function, it
  // is invoked with its parent as context. Returns the value of the final
  // child, or `fallback` if any child is undefined.
  _.result = function(obj, path, fallback) {
    if (!_.isArray(path)) path = [path];
    var length = path.length;
    if (!length) {
      return _.isFunction(fallback) ? fallback.call(obj) : fallback;
    }
    for (var i = 0; i < length; i++) {
      var prop = obj == null ? void 0 : obj[path[i]];
      if (prop === void 0) {
        prop = fallback;
        i = length; // Ensure we don't continue iterating.
      }
      obj = _.isFunction(prop) ? prop.call(obj) : prop;
    }
    return obj;
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate: /<%([\s\S]+?)%>/g,
    interpolate: /<%=([\s\S]+?)%>/g,
    escape: /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'": "'",
    '\\': '\\',
    '\r': 'r',
    '\n': 'n',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escapeRegExp = /\\|'|\r|\n|\u2028|\u2029/g;

  var escapeChar = function(match) {
    return '\\' + escapes[match];
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  // NB: `oldSettings` only exists for backwards compatibility.
  _.template = function(text, settings, oldSettings) {
    if (!settings && oldSettings) settings = oldSettings;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset).replace(escapeRegExp, escapeChar);
      index = offset + match.length;

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      } else if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      } else if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }

      // Adobe VMs need the match returned to produce the correct offset.
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + 'return __p;\n';

    var render;
    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled source as a convenience for precompilation.
    var argument = settings.variable || 'obj';
    template.source = 'function(' + argument + '){\n' + source + '}';

    return template;
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

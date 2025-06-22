let activeEffect = null;

function watchEffect(effect) {
  activeEffect = effect;
  effect();
  activeEffect = null;
}

function uiValue(defaultValue = 0) {
  let obj = { value: defaultValue };
  let deps = new Set();

  obj = new Proxy(obj, {
    get(target, prop) {
      if (prop === "value" && activeEffect) {
        deps.add(activeEffect);
      }
      return target[prop];
    },
    set(target, prop, val) {
      target[prop] = val;
      if (prop === "value") {
        deps.forEach((effect) => effect());
      }
      return true;
    },
  });

  return obj;
}

let score = uiValue(0);
let money = uiValue(100);

watchEffect(() => {
  console.log("Score is now:", score.value);
});

watchEffect(() => {
  console.log("Money is now:", money.value);
});

score.value = 10;
money.value = 150;
score.value = 42;

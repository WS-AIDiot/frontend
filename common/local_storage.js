window.local_storage = {
    get: (key, default_value) => {
        let result = localStorage.getItem(key);
        result = (result === null) ? default_value : JSON.parse(result);
        return result;
    },
    set: (key, value) => {
        let str = JSON.stringify(value);
        localStorage.setItem(key, str);
        return str;
    },
    get_and_set: function (key, default_value, callback) {
        let item = callback(this.get(key, default_value));
        this.set(key, item);
        return item;
    },
};

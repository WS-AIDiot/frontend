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
    }
};

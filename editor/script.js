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


window.addEventListener("load", () => {
    let active_editor = 0;
    let tabs = document.getElementsByClassName("tab");
    let editors = document.getElementsByClassName("editor");
    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        tab.addEventListener("click", (ev) => {
            tabs[active_editor].classList.remove("active");
            editors[active_editor].classList.remove("active");
            active_editor = i;
            tabs[i].classList.add("active");
            editors[i].classList.add("active");
        });
    }
});

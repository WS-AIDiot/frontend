const MIN_SCOPES = [
    ".../auth/drive.appdata",
    ".../auth/drive",
    ".../auth/drive.metadata",
];

MIN_SCOPES.forEach((value, index, array) => {
    array[index] = value.replace("...", "https://www.googleapis.com");
});

window.ENV = {
    ENV: "static",
    GAPI_CONFIG: {
        API_KEY: "AIzaSyDOC9obHL531Qhk4o39YFoHjnNlWWL3DLI",
        // Your API key will be automatically added to the Discovery Document URLs.
        DISCOVERY_DOCS: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
        // clientId and scope are optional if auth is not required.
        CLIENT_ID: "32068305651-1gob6l87fbreolp2sdmprplr634iadv5.apps.googleusercontent.com",
        SCOPE: MIN_SCOPES.join(" "),
    },
};

console.log(ENV);

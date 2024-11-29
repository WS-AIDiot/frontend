/*
    <script src="/env.js"></script>
    <script src="/gapi.js"></script>
    <script src="/common/local_storage.js"></script>
    <script async defer src="https://apis.google.com/js/api.js"></script>
*/

window.prepare_gapi = () => {
    return new Promise((resolve, reject) => {
        gapi.load("client", async () => {
            console.log("gAPI loaded");
            await gapi.client.init({
                apiKey: window.ENV.GAPI_CONFIG.API_KEY,
                discoveryDocs: window.ENV.GAPI_CONFIG.DISCOVERY_DOCS,
            });
            gapi.client.setToken({"access_token": window.local_storage.get("user").access_token});
            console.log("gAPI inited");
            resolve(gapi);
        });
    });
};

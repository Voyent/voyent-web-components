var poly;
Polymer({
    is: "voyent-solicit",

    properties: {
        /**
         * Defines the Voyent account of the realm.
         * @default voyent.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * Defines the Voyent realm to request location data for.
         * @default voyent.io.auth.getLastKnownRealm()
         */
        realm: { type: String},
        /**
         * Data to be inserted into the page, passed from the request
         */
        data:{
            type:Object,
            notify: true,
            reflectToAttribute:true
        },
        /**
         * Show or hide the choice buttons
         */
        showChoices:{
            type:Boolean,
            notify: true
        },
        /**
         * Access token for service permissions
         */
        accessToken:{
            type:String
        },
        /**
         * Username for service usage
         */
        username:{
            type:String,
            notify: true
        },
        /**
         * Host used for services
         */
        host:{
            type:String
        }

    },

    created: function() {
        poly = this;
    },

    ready: function() {
        if (!this.realm) {
            this.realm = voyent.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = voyent.io.auth.getLastKnownAccount();
        }
        if (!this.username){
            this.username = voyent.io.auth.getLastKnownUsername();
        }
        var solicitURLData = poly.getURLParameter('solicit');
        if(solicitURLData !== null){
            solicitURLData = JSON.parse(solicitURLData);
            poly.data = solicitURLData;
            poly.showSolicit();
        }
        else {
            if (poly.data) {
                poly.dataChanged();
            }
        }


    },

// Trial data: {"message":"Would you like a message?", "options":[{"label":"Yes Please", "value":"y"},{"label":"No Thanks", "value": "n"}],"event":{"service":"freight","event":"offer","type":"candy"}}
    //******************PRIVATE API******************

    /**
     * Trigger an event when an answer is given, as well as updating our view to reflect the app state
     */
    answerGiven: function(e){
        var element;
        if(e.srcElement){
          element = e.srcElement.closest('.solicitMain');
        }
        else{
          element = e.target.closest('.solicitMain');
        }
        //element.classList.add('hidden');
        //element.classList.remove('visible');
        //setTimeout(function(){
            //poly.data = {};
            //element.classList.add('removed');
        //},100);
        var params = {};
        if(poly.account){
            params.account = poly.account;
        }
        if(poly.realm){
            params.realm = poly.realm;
        }
        if (poly.accessToken){
            params.accessToken = poly.accessToken;
        }
        if(poly.data.event){
          params.event = poly.data.event;
          params.event.data = {'result': e.model.item.value};
          params.event.data.pass = params.event.pass;
          delete params.event.pass;
          voyent.io.metrics.createCustomEvent(params);
        }
    },

    /**
     * Retrieve and decode URL parameters
     */
    getURLParameter: function(name) {
        return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search)||[,""])[1].replace(/\+/g, '%20'))||null;
    },

    /**
     * Toggle the view when our data is changed
     */
    dataChanged: function(){
        if(poly.data !== {}) {
            poly.$$('.solicitMain').classList.remove('removed');
            poly.$$('.solicitMain').classList.remove('hidden');
            poly.$$('.solicitMain').classList.add('visible');
        }
    },

    /**
     * Hide this component by toggling some CSS classes
     */
    hideSolicit: function () {
      poly.$$('.solicitMain').classList.add('hidden');
      poly.$$('.solicitMain').classList.remove('visible');
      poly.$$('.solicitMain').classList.add('removed');
    },

    /**
     * Show this component by toggling some CSS classes
     */
    showSolicit: function(){
      poly.$$('.solicitMain').classList.remove('removed');
      poly.$$('.solicitMain').classList.remove('hidden');
      poly.$$('.solicitMain').classList.add('visible');
    }
});




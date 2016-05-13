var poly;
Polymer({
    is: "bridgeit-solicit",

    properties: {
        /**
         * Defines the BridgeIt account of the realm.
         * @default bridgeit.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * Defines the BridgeIt realm to request location data for.
         * @default bridgeit.io.auth.getLastKnownRealm()
         */
        realm: { type: String},
        data:{
            type:Object,
            notify: true,
            reflectToAttribute:true
        },
        showChoices:{
            type:Boolean,
            notify: true
        },
        accessToken:{
            type:String
        },
        username:{
            type:String,
            notify: true
        },
        host:{
            type:String
        }

    },

    created: function() {
        poly = this;
    },

    ready: function() {
        if (!this.realm) {
            this.realm = bridgeit.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = bridgeit.io.auth.getLastKnownAccount();
        }
        if (!this.username){
            this.username = bridgeit.io.auth.getLastKnownUsername();
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
          bridgeit.io.metrics.createCustomEvent(params);
        }
    },

    getURLParameter: function(name) {
        return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search)||[,""])[1].replace(/\+/g, '%20'))||null;
    },

    dataChanged: function(){
        if(poly.data !== {}) {
            poly.$$('.solicitMain').classList.remove('removed');
            poly.$$('.solicitMain').classList.remove('hidden');
            poly.$$('.solicitMain').classList.add('visible');
        }
    },

    hideSolicit: function () {
      poly.$$('.solicitMain').classList.add('hidden');
      poly.$$('.solicitMain').classList.remove('visible');
      poly.$$('.solicitMain').classList.add('removed');
    },

  showSolicit: function(){
      poly.$$('.solicitMain').classList.remove('removed');
      poly.$$('.solicitMain').classList.remove('hidden');
      poly.$$('.solicitMain').classList.add('visible');
  }
});




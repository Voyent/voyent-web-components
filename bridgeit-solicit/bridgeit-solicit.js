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
            observer:'dataChanged',
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
        var element = e.srcElement.closest('.solicitMain');
        element.classList.add('hidden');
        setTimeout(function(){
            element.classList.add('removed');
        },700);
        var params = {};
        if(poly.account !== null){
            params.account = poly.account;
        }
        if(poly.realm !== null){
            params.realm = poly.realm;
        }
        if (poly.accessToken !== null){
            params.accessToken = poly.accessToken;
        }
        params.event = poly.data.event;
        params.event.data = e.model.item.value;
        bridgeit.io.metrics.createCustomEvent(params);
    },

    getURLParameter: function(name) {
        return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search)||[,""])[1].replace(/\+/g, '%20'))||null;
    },

    dataChanged: function(){
        poly.$$('.solicitMain').classList.remove('removed');
    }
});

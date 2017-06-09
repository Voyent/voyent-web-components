(function() {
    'use strict';

    Polymer({
        is: 'voyent-login-paper-card',

        behaviors: [
            Polymer.IronFormElementBehavior,
            Polymer.IronValidatableBehavior
        ],

        properties: {
            /**
             * Header text to title our login card
             */
            heading: {
                notify: true,
                type: String
            },
            /**
             * Username input
             */
            username: {
                notify: true,
                type: String,
                value: function(){ return voyent.auth.getLastKnownUsername();}
            },
            /**
             * Password input
             */
            password: {
                notify: true,
                type: String
            },
            /**
             * Toggle whether this component is visible
             */
            visible: {
                notify: true,
                type: Boolean
            },
            /**
             * Error string custom to this component that displays below our login card
             */
            error: {
                notify: true,
                type: String
            },
            /**
             * Authentication provider to use in conjunction with our login details
             */
            authProvider: {
                notify: true,
                type: String
            },
            /**
             * Text label for the submit button
             */
            submitLabel: {
                notify: true,
                type: String
            },
            /**
             * Text label for the cancel button
             */
            cancelLabel: {
                notify: true,
                type: String
            },
            /**
             * Determine if we should attempt to login as an admin
             */
            loginAsAdmin: {
                notify: true,
                type: Boolean
            },
            /**
             * Image to use in the header of our login card
             */
            headerImage: {
                notify: true,
                type: String
            },
            /**
             * Determine if we should show a realm input field
             */
            showrealminput: {
                notify: true,
                type: Boolean
            },
            /**
             * Determine if we should show an account input field
             */
            showaccountinput: {
                notify: true,
                type: Boolean
            },
            /**
             * Determine if we should show a host input field
             */
            showhostinput: {
                notify: true,
                type: Boolean
            },
            /**
             * Label for the Realm field
             * Also used automatically as part of the placeholder
             */
            realminputlabel: {
                type: String,
                notify: true,
                value: 'Realm'
            },
            /**
             * Label for the Account field
             * Also used automatically as part of the placeholder
             */
            accountinputlabel: {
                type: String,
                notify: true,
                value: 'Account'
            },
            /**
             * Show a button that allows the details panel (realm, account, host) to be hidden
             * This ties to an iron-collapse wrapper
             */
            hideallowed: {
                notify: true,
                type: Boolean,
                value: false
            },
            /**
             * Toggle the initial state of the details panel (realm, account, host)
             */
            hideclosed: {
                notify: true,
                type: Boolean,
                value: false
            },
            /**
             * Realm used for services
             */
            realm: {
                notify: true,
                type: String,
                value: function(){ return voyent.auth.getLastKnownRealm(); }
            },
            /**
             * Account used for services
             */
            account: {
                notify: true,
                type: String,
                value: function(){ return voyent.auth.getLastKnownAccount(); }
            },
            /**
             * Host used for services
             */
            host: {
                notify: true,
                type: String,
                value: 'dev.voyent.cloud'
            }
        },
        
        attached: function() {
            if (document.getElementById("username")) {
                document.getElementById("username").focus();
            }
        },

        /**
         * Fired when the login card is submitted
         * Interact with the authentication provider using our various field data to determine if the login was valid
         *
         * @param e
         */
        handleLogin: function(e){
            var _this = this;
            var authProvider = document.querySelector('#' + this.authProvider) ||
                               Polymer.dom(this).parentNode.querySelector('#' + this.authProvider);
            if( !authProvider ){
                console.error('voyent-login-paper-card could not find auth-provider: ' + this.authProvider);
                return;
            }
            this.$$('#loginSpinner').active = true;
            if(_this.showrealminput) {
                authProvider.setAttribute("realm",_this.realm);
            }
            if(_this.showaccountinput){
                // Pre-process our account to a form understandable by the login
                authProvider.setAttribute("account", this._getSafeDatabaseName(_this.account));
            }
            if(_this.showhostinput){
                authProvider.setAttribute("host",_this.host)
            }
            authProvider.login(this.username, this.password, this.loginAsAdmin).then(function(){
                //clear password
                _this.password = '';
                _this.$$('#loginSpinner').active = false;
            }).catch(function(){
                _this.$$('#loginSpinner').active = false;
            });
            e.preventDefault();
        },
        
        _getSafeDatabaseName: function(accountName) {
            if (accountName && accountName.trim().length > 0) {
                return accountName.split(' ').join('_').replace(/[\\\/\.\"]/g, '').substring(0, 63).toLowerCase();
            }
            return accountName;
        },

        /**
         * Reset the password
         */
        _clearPassword: function(){
            this.password = '';
        },

        /**
         * Reset the username
         */
        _clearUsername: function(){
            this.username = '';
        },

        /**
         * Reset the realm
         */
        _clearRealm: function(){
            this.realm = '';
        },

        /**
         * Reset the account
         */
        _clearAccount: function(){
            this.account = '';
        },

        /**
         * Reset the account
         */
        _clearHost: function(){
            this.host = '';
        },

        /**
         * Overidden from Polymer.IronValidatableBehavior
         * Will set the `invalid` attribute automatically, which should be used for styling.
         */
        _getValidity: function() {
            return !!this.password && !!this.username;
        },

        /**
         * Fired when cancel is clicked, which will reset the username & password inputs
         */
        cancel: function(){
            this._clearUsername();
            this._clearPassword();
        }
    });
})();

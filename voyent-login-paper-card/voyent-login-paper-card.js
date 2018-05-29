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
             * Whether the component should search for the realm details, only relevant if showrealminput is false.
             */
            searchforrealm: {
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
            disablehostinput: {
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
            },
            hidden: {
                notify: true,
                type: Boolean,
                value: false
            },
        },
        
        attached: function() {
            setTimeout(function() {
                if (document.getElementById("username")) {
                    document.getElementById("username").focus();
                }
            },0);
            this._regionResults = [];
        },

        /**
         * Fired when the login card is submitted
         * Interact with the authentication provider using our various field data to determine if the login was valid
         *
         * @param e
         */
        handleLogin: function(e){
            var _this = this;
            e.preventDefault();
            this._authProviderElem = document.querySelector('#' + this.authProvider) ||
                               Polymer.dom(this).parentNode.querySelector('#' + this.authProvider);
            if( !this._authProviderElem ){
                console.error('voyent-login-paper-card could not find auth-provider: ' + this.authProvider);
                return;
            }
            this.fire('loading-on');
            // Pre-process our account to a form understandable by the login
            var safeAccount = this._getSafeDatabaseName(this.account);
            if(this.showaccountinput) {
                this._authProviderElem.setAttribute("account", safeAccount);
            }
            if(this.showhostinput) {
                this._authProviderElem.setAttribute("host",this.host)
            }
            if(this.showrealminput) {
                this._authProviderElem.setAttribute("realm",this.realm);
            }
            else if (this.searchforrealm) {
                this._authProviderElem.set('error',null);
                this._publicLookupUser(this.username,safeAccount).then(function(res) {
                    if (!res.matches.length) {
                        _this.fire('loading-off');
                        _this._authProviderElem.set('error','Unauthorized');
                    }
                    else if (res.matches.length === 1) {
                        _this.set('realm',res.matches[0].realm);
                        _this._authProviderElem.setAttribute("realm",_this.realm);
                        _this._login();
                    }
                    else {
                        _this.set('_regionResults',res.matches);
                        _this.fire('loading-off');
                    }
                }).catch(function() {
                    _this.fire('loading-off');
                });
                return;
            }
            this._login();
        },

        _login: function() {
            var _this = this;
            this._authProviderElem.login(this.username, this.password, this.loginAsAdmin).then(function() {
                //clear password
                _this.password = '';
                _this.fire('loading-off');
            }).catch(function(){
                _this.fire('loading-off');
            });
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
            this._regionResults = [];
        },

        _cancelRegionResults: function() {
            this._clearPassword();
            this.set('_regionResults',[]);
        },

        /**
         * Lookup a user by username, in any account/realm
         */
        _publicLookupUser: function(username, account) {
            var sourceUrl = this._getHttpProtocol() + this.host + "/vs/vras/realms/public/users/?name=" + username;
            if (account) {
                sourceUrl += '&account=' + account;
            }
            return new Promise(
                function(resolve, reject) {
                    // Try to retrieve the desired JSON
                    voyent.$.get(sourceUrl).then(function(res) {
                        if (res) {
                            try {
                                resolve(JSON.parse(res));
                            }
                            catch(e) {
                                resolve(res);
                            }
                        }
                    }).catch(function(error) {
                        reject(error);
                    });
                }
            );
        },

        _getHttpProtocol: function() {
            return ('https:' == document.location.protocol ? 'https://' : 'http://');
        },

        _arrayLength: function(array) {
            return array ? array.length : 0;
        },

        _getRegionName: function(regionDetails) {
            return regionDetails.displayName || regionDetails.realm || 'Unknown';
        },

        _getRegionDescription: function(regionDetails) {
          return regionDetails.description && regionDetails.description.trim().length ? (' - ' + regionDetails.description) : '';
        },

        _selectRegion: function(e) {
            this.set('realm',e.model.item.realm);
            this._authProviderElem.setAttribute("realm",this.realm);
            this._login();
        }
    });
})();

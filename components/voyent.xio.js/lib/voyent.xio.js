if (!('voyent' in window) || ('voyent.io' in window)) {
    throw new Error('voyent.xio.js requires voyent.js and voyent.io.js, please include these before voyent.xio.js');
}

if (!('io' in window)) {
    throw new Error('voyent.xio.js requires the socket.io client library.js');
}

(function (v) {

    "use strict";

    //A 'creative' way to parse a URL without requiring a separate library
    function parseURL(urlString) {
        var parser = document.createElement('a');
        parser.href = urlString;

        //Good old IE does things a bit different.  Like including port 80 always
        //and not including a leading slash on the pathname.
        var result = {
            href: parser.href,
            hostname: parser.hostname,
            host: parser.port === "80" ? parser.hostname : parser.host,
            port: parser.port === "80" ? "" : parser.port
        };

        if (parser.pathname[0] !== '/') {
            result.pathname = '/' + parser.pathname;
        } else {
            result.pathname = parser.pathname;
        }
        var pathParts = result.pathname.split('/');

        result.service = pathParts[1];
        result.account = pathParts[2];
        result.realm = pathParts[4];
        result.namespace = '/' + result.account + '/realms/' + result.realm;
        return result;
    }

    function getNamespaceGroup(groupName) {
        return v.xio.push.pushURL.namespace + '/' + groupName;
    }

    function getNamespaceGroupEvent(groupName, eventName) {
        return getNamespaceGroup(groupName) + '/' + eventName;
    }

    function getNamespaceGroupNotifyEvent(groupName) {
        return getNamespaceGroupEvent(groupName, 'notify');
    }

    var XIO_CLOUD_URI_KEY = "xio.cloudURI";
    var XIO_SMS_URI_KEY = "xio.smsURI";
    var XIO_EMAIL_URI_KEY = "xio.emailURI";

    function getStoredCloudPushURI() {
        var cloudURI = v.getLocalStorageItem(XIO_CLOUD_URI_KEY);
        if (cloudURI) {
            return cloudURI;
        }

        var notifyBack = v.getCloudPushId();
        if (notifyBack) {
            setStoredCloudPushURI(notifyBack);
            return notifyBack;
        }
        return null;
    }

    function setStoredCloudPushURI(cloudPushURI) {
        v.setLocalStorageItem(XIO_CLOUD_URI_KEY, cloudPushURI);
    }

    function removeStoredCloudPushURI(cloudPushURI) {
        v.removeLocalStorageItem(XIO_CLOUD_URI_KEY);
    }

    function getStoredSmsURI() {
        var smsURI = v.getLocalStorageItem(XIO_SMS_URI_KEY);
        return smsURI || null;
    }

    function setStoredSmsURI(smsURI) {
        v.setLocalStorageItem(XIO_SMS_URI_KEY, smsURI);
    }

    function removeStoredSmsURI() {
        v.removeLocalStorageItem(XIO_SMS_URI_KEY);
    }

    function getStoredEmailURI() {
        var emailURI = v.getLocalStorageItem(XIO_EMAIL_URI_KEY);
        return emailURI || null;
    }

    function setStoredEmailURI(emailURI) {
        v.setLocalStorageItem(XIO_EMAIL_URI_KEY, emailURI);
    }

    function removeStoredEmailURI() {
        v.removeLocalStorageItem(XIO_EMAIL_URI_KEY);
    }

    //Unfortunately, cloud push URI values are unsuitable as database ids which
    //is what we'd really like to use (generally too long). Was attempting to use
    //a hash algorithm but it returned inconsistent ids depending on which device
    //it ran on. Switched to using something more deterministic.
    function getDatabaseId(str) {

        if (!str || str.length == 0) return;

        //Replace any illegal chars with underscores
        var id = str.replace(/[\$. ]/g, '_');

        //Remove any prefixs from previously stored values
        id = id.replace(/clouduri\_/g, '');
        id = id.replace(/clouduri/g, '');

        //Arbitrarily chop at 40 characters as some cloud uris are quite long
        return id.substr(0, 39);
    }

    function getCloudPushURIHash(cloudPushURI) {
        var theURI = cloudPushURI || getStoredCloudPushURI();
        return v.io.auth.getLastKnownUsername() + '_' + getDatabaseId(theURI);
    }

    function getSmsURIHash(smsURI) {
        var theURI = smsURI || getStoredSmsURI();
        return 'smsuri_' + getDatabaseId(theURI);
    }

    function getEmailURIHash(emailURI) {
        var theURI = emailURI || getStoredEmailURI();
        return 'emailuri_' + getDatabaseId(theURI);
    }

    function getCloudServiceURL(host, account, realm, id) {
        return 'http://' + host + '/push/' +
            account + '/realms/' + realm +
            '/cloud/' + id +
            '?access_token=' + v.io.auth.getLastAccessToken();
    }

    function addCloudConfiguration(host, account, realm, username, theURI, transport, setConfig) {

        return new Promise(function (resolve, reject) {


            var uriHash = getURIHashForTransport(transport,theURI);
            if (!uriHash) {
                reject();
                return;
            }

            var pushServiceURL = getCloudServiceURL(host, account, realm, uriHash);

            var config;

            if(setConfig){
              config = setConfig;
            }
            else{
              config = {
                username: username,
                cloudPushURI: theURI,
                enabled: true
              };
            }

            console.log('preparing to store '+transport+' configuration', pushServiceURL, config);

            return v.$.post(pushServiceURL, config)
                .then(function (response) {
                    console.log(transport + ' configuration stored');
                    //Should we still do this?
                    //v.services.auth.updateLastActiveTimestamp();
                    resolve(response);
                })['catch'](function (error) {
                console.log('error storing '+transport+' configuration', error);
                reject(error);
            });
        });
    }


    //Sets the cloud configuration's enabled attribute to setTo
    function setEnabledCloudConfiguration(setTo, host, account, realm, theURI, transport){

      getCloudConfiguration(host,account,realm,theURI,transport).then(function(configuration){
        console.log(configuration);
        var newConfig = configuration[0];
        newConfig.enabled = setTo;
        addCloudConfiguration(host,account,realm,null,theURI,transport,newConfig);
      });
    }

   function toggleEnabledCloudConfiguration(host, account, realm, theURI, transport){
     getCloudConfiguration(host,account,realm,theURI,transport).then(function(configuration){
       console.log(configuration);
       var newConfig = configuration[0];
       newConfig.enabled = !configuration[0].enabled;
       addCloudConfiguration(host,account,realm,null,theURI,transport,newConfig);
     });
   }
    function getCloudConfiguration(host, account, realm, theURI, transport) {

        return new Promise(
            function (resolve, reject) {

                var uriHash = getURIHashForTransport(transport,theURI);
                if (!uriHash) {
                    reject();
                    return;
                }

                var pushServiceURL = getCloudServiceURL(host, account, realm, uriHash);

                console.log('preparing to get '+transport+' configuration', pushServiceURL);

                v.$.getJSON(pushServiceURL)
                    .then(function (response) {
                        console.log(transport + ' configuration retrieved');
                        //Should we still do this?
                        //v.services.auth.updateLastActiveTimestamp();
                        resolve(response);
                    })['catch'](function (error) {
                    console.log('error getting '+transport+' configuration', error);
                    reject(error);
                });
            }
        );

    }

    function deleteCloudConfiguration(host, account, realm, theURI, transport) {

        return new Promise(
            function (resolve, reject) {

                var uriHash = getURIHashForTransport(transport,theURI);
                if (!uriHash) {
                    reject();
                    return;
                }

                var pushServiceURL = getCloudServiceURL(host, account, realm, uriHash);

                console.log('preparing to get '+transport+' configuration', pushServiceURL);

                v.$.doDelete(pushServiceURL)
                    .then(function () {
                        console.log(transport + ' configuration deleted');
                        //Should we still do this?
                        //v.services.auth.updateLastActiveTimestamp();
                        resolve();
                    })['catch'](function (error) {
                    console.log('error deleting '+transport+' configuration', error);
                    reject(error);
                });
            }
        );

    }

    function getURIHashForTransport(transport,theURI) {
        switch (transport) {
            case "cloud":
                return getCloudPushURIHash(theURI);
            case "sms":
                return getSmsURIHash(theURI);
            case "email":
                return getEmailURIHash(theURI);
            default:
                return null;
        }
    }

    function getGroupPushServiceURL(host, account, realm, username) {
        return 'http://' + host + '/push/' +
            account + '/realms/' + realm +
            '/group/' + username +
            '?access_token=' + v.io.auth.getLastAccessToken();
    }

    function isString(s) {
        return typeof(s) === 'string' || s instanceof String;
    }

    function sendGroupPush(host, account, realm, group, message) {
        return new Promise(
            function (resolve, reject) {

                var groupPushURL = getGroupPushServiceURL(host, account, realm, group);

                //Messages to the REST API should look like this where the cloud section
                //is optional but the the browser section is not:
                //{
                //    "cloud": {
                //        "details": "detailsStringGoesHere",
                //        "subject": "subjectStringGoesHere"
                //    },
                //    "browser": {
                //        //can be any arbitrary JSON object that the brower can parse, format, etc
                //    }
                //}

                if (!message || message === "") {
                    reject(new Error('invalid message format'));
                }

                if (isString(message)) {
                    message = {browser: message};
                }

                if (!message.cloud) {
                    console.warn('message missing "cloud" property so no Cloud Push notifications will be sent');
                }

                console.log('preparing to send push notification', group, JSON.stringify(message));

                v.$.post(groupPushURL, message, null, false, 'application/json')
                    .then(function (response) {
                        console.log('push notification sent');
                        //Should we still do this?
                        //v.services.auth.updateLastActiveTimestamp();
                        resolve();
                    })['catch'](function (error) {
                    console.log('error sending push notification', error);
                    reject(error);
                });
            }
        );
    }

    function handleNotifications(payload) {
        console.log('received notification', JSON.stringify(payload));
        for (var i=0; i<v.xio.push.listeners.length; i++) {
            v.xio.push.listeners[i](payload);
        }
    }

    //Set up the xio namespace.
    if (!v['xio']) {
        v.xio = {};
    }

    var xio = v.xio;

    xio.push = {

        connected: false,
        pushURL: null,
        client: null,
        listeners: [],
        groups: [],
        maxReconnectAttempts: 10,

        connectWithToken: function (parsedURL, username, access_token) {

            var connectionOptions = {
                host: parsedURL.hostname,
                secure: false,
                path: parsedURL.pathname,
                port: parsedURL.port,
                query: 'access_token=' + access_token,
                transports: ['polling'],
                forceNew: true
            };

            console.debug('connectionOptions', JSON.stringify(connectionOptions, null, 4));

            this.client = io('http://' + parsedURL.host, connectionOptions);

            //I don't have the scoping right, but for now I'm just setting the "outer"
            //client manually.
            xio.push.client = this.client;

            //console.debug('new push client', this.client);

            this.client.on('connect', function () {
                console.log('push client connected');
                xio.push.connected = true;
                xio.push.rejoinGroups();

                //Automatically join the group associated with this username
                xio.push.join(username);
            });

            this.client.on('reconnect', function () {
                console.log('push client reconnected');
                xio.push.rejoinGroups();
            });

            this.client.on('reconnecting', function (attemptNumber) {
                console.log('push client reconnection attempt ' + attemptNumber + ' of ' + xio.push.maxReconnectAttempts);
                if(attemptNumber >= xio.push.maxReconnectAttempts){
                    console.warn('push client reconnection attempts exceeded, disconnecting');
                    xio.push.disconnect();
                }
            });

            //Seems to be behave pretty much the same as the event handler for 'reconnecting'
            //this.client.on('reconnect_attempt', function (attemptNumber) {
            //    console.log('push client reconnect attempt ' + attemptNumber + ' of ' + xio.push.maxReconnectAttempts);
            //    if(attemptNumber >= xio.push.maxReconnectAttempts){
            //        console.warn('reconnect attempts exceeded, disconnecting');
            //        xio.push.disconnect();
            //    }
            //});

            this.client.on('reconnect_error', function (err) {
                console.error('push client reconnect error', err);
            });

            this.client.on('disconnect', function () {
                xio.push.connected = false;
                console.warn('push client disconnected');
            });

            this.client.on('error', function (err) {
                console.error('push client connection error', new Error(err));
            });

        },

        /**
         * Establish a connection (polling, websocket) to the Push host. Will login and get
         * an access_token as required.
         *
         * @param {String} pushURLString The URL of the Push host
         * @param {String} username
         * @param {String} password
         *
         */
        connect: function (pushURLString, username, password) {

            if (this.connected) {
                Promise.resolve();
            }

            this.pushURL = parseURL(pushURLString);
            console.log('parsedURL', this.pushURL);

            var connectionInfo = {
                account: this.pushURL.account,
                realm: this.pushURL.realm,
                host: this.pushURL.host,
                username: username,
                password: password,
                pushURL: this.pushURL,
                connectSocketIO: this.connectWithToken,
                usePushService: false
            };

            console.log('connecting via voyent.xio', JSON.stringify(connectionInfo, null, 4));

            return v.io.auth.connect(connectionInfo).then(function () {
                    //Once we connect, we should be able to connect our socket.io client.
                    var lastToken = v.io.auth.getLastAccessToken();
                    console.log('successfully logged into services', connectionInfo.host, lastToken);
                    connectionInfo.connectSocketIO(connectionInfo.pushURL, connectionInfo.username, lastToken);
                })
                .catch(function (error) {
                    console.log('push client error connecting', error);
                });
        },

        /**
         * Establish a connection (polling, websocket) to the Push host after voyent.io.auth.login() or voyent.io.auth.connect()
         *
         * @param {String} pushURLString The URL of the Push host
         * @param {String} username
         *
         */
        attach: function (pushURLString, username) {
            if (this.connected) {
                return;
            }
            if (!v.io.auth.isLoggedIn()) {
                console.error('cannot attach voyent.xio.push, voyent is not logged in');
            }

            this.pushURL = parseURL(pushURLString);
            //console.debug('parsedURL', this.pushURL);

            console.log('attaching via voyent.xio', JSON.stringify(this.pushURL, null, 4));

            var lastToken = v.io.auth.getLastAccessToken();
            this.connectWithToken(this.pushURL, username, lastToken);
        },

        disconnect: function () {

            //Calling auth.disconnect here removes all the relevant data from
            //from the browser's session storage which causes problems when
            //trying refreshConnection().
            //v.io.auth.disconnect();

            if (this.client) {
                console.log('disconnecting socket.io client');
                this.client.disconnect();
            }
        },

        refreshConnection: function () {
            console.log('refreshing connection');
            xio.push.disconnect();
            xio.push.connectWithToken(
                xio.push.pushURL,
                v.io.auth.getLastKnownUsername(),
                v.io.auth.getLastAccessToken());
        },

        addListener: function (listener) {
            if (!listener || typeof listener !== 'function') {
                console.log('unable to add new listener since it is not a function');
                return;
            }
            this.listeners.push(listener);
        },

        removeListener: function (listener) {
            var index = this.listeners.indexOf(listener);
            if (index > -1) {
                this.listeners.splice(index,1);
            }
        },

        join: function (group) {

            console.log('attempting to join group', group);

            if (!this.connected) {
                console.log('not yet connected');
                return;
            }

            if (this.groups.indexOf(group) >= 0) {
                console.log('already a member', group);
                return;
            }

            console.log('joining', group, getNamespaceGroupNotifyEvent(group));
            this.groups.push(group);
            this.client.on(getNamespaceGroupNotifyEvent(group), handleNotifications);
            this.client.emit('join', group);
        },

        leave: function (group) {

            if (!this.connected) {
                return;
            }

            console.log('leave', group);

            var groupIndex = this.groups.indexOf(group);
            if (groupIndex === -1) {
                console.log('not a member', group);
                return;
            }

            console.log('leaving', group);
            this.client.removeListener(getNamespaceGroupNotifyEvent(group), handleNotifications);
            this.client.emit('leave', group);
            this.groups.splice(groupIndex, 1);
        },

        rejoinGroups: function () {

            //If a socket gets disconnected for some reason, a reconnection can occur
            //automatically but the groups that were joined will have gone away.  This
            //function tries to rejoin the groups.
            if (!this.connected) {
                return;
            }

            console.log('rejoining groups', this.groups);

            for (var i = 0; i < this.groups.length; i++) {
                var group = this.groups[i];
                var ns = getNamespaceGroupNotifyEvent(group);
                console.log('rejoining', group, ns);
                this.client.removeListener(getNamespaceGroupNotifyEvent(group),handleNotifications);
                this.client.on(ns, handleNotifications);
                this.client.emit('join', group);
            }
        },

        send: function (group, message) {
            if (!this.connected) {
                return;
            }
            var payload = {
                group: group,
                message: message
            };
            console.log('send', payload);
            this.client.emit('send', payload);
        },

        sendREST: function (host, account, realm, group, message) {
            return sendGroupPush(host, account, realm, group, message);
        },


        registerCloudPush: function (host, account, realm, username) {
            console.log('registerCloudPush(' + host + ', ' + account + ', ' + realm + ", " + username + ")");
            return new Promise(function (resolve, reject) {
                var cloudPushURI = getStoredCloudPushURI();
                if (cloudPushURI) {
                    return addCloudConfiguration(host, account, realm, username, cloudPushURI, 'cloud').then(function(){
                        resolve();
                    });
                }

                v.setLocalStorageItem('xio.host', host);
                v.setLocalStorageItem('xio.account', account);
                v.setLocalStorageItem('xio.realm', realm);
                v.setLocalStorageItem('xio.username', username);

                //intercept launchFailed to report a reject, then set it back
                var origLaunchFailed = v.launchFailed;
                v.launchFailed = function(){
                    console.log('launchFailed from registerCloudPush()');
                    reject('could not launch the voyent client app');
                    v.launchFailed = origLaunchFailed;
                };
                window.xioCloudRegistrationCallback = function(results) {
                    console.log('global cloud registration callback called', results);
                    v.xio.push.registerCloudPush(
                        v.getLocalStorageItem('xio.host'),
                        v.getLocalStorageItem('xio.account'),
                        v.getLocalStorageItem('xio.realm'),
                        v.getLocalStorageItem('xio.username')
                    );
                    v.launchFailed = origLaunchFailed;
                    resolve();
                };
                v.register('_xioCloudRegistration', 'xioCloudRegistrationCallback');
            });
        },

        cloudPushRegistered: function(){
            return !!getStoredCloudPushURI();
        },

        //registrationCallback: function (results) {
        //    var cloudPushURI = getStoredNotifyBackURI();
        //    console.log('cloud push registration callback', 'results:', results, 'cloudPushURI:', cloudPushURI);
        //    setStoredCloudPushURI(cloudPushURI);
        //    addCloudConfiguration(host, account, realm, username, cloudPushURI, 'cloud')
        //        .then(function () {
        //            console.log('registered cloud push URI');
        //        })
        //        .catch(function (err) {
        //            console.log('error registering cloud push URI', err);
        //        });
        //},

        unregisterCloudPush: function (host, account, realm) {
            var cloudPushURI = getStoredCloudPushURI();
            v.unregisterCloudPush();
            if (cloudPushURI) {
                removeStoredCloudPushURI();
                return deleteCloudConfiguration(host, account, realm, cloudPushURI, 'cloud');
            }
        },

        registerSms: function (host, account, realm, username, phonenumber) {
            console.log('registerSms(' + host + ', ' + account + ', ' + realm + ", " + username + ', ' + phonenumber + ')');
            return new Promise(function (resolve, reject) {
                var smsURI = getStoredSmsURI();
                if (!smsURI) {
                    smsURI = 'sms:'+phonenumber;
                    setStoredSmsURI(smsURI);
                }
                return addCloudConfiguration(host, account, realm, username, smsURI, 'sms').then(function() {
                    resolve();
                });
            });
        },

        unregisterSms: function (host, account, realm) {
            var smsURI = getStoredSmsURI();
            if (smsURI) {
                removeStoredSmsURI();
                return deleteCloudConfiguration(host, account, realm, smsURI, 'sms');
            }
        },

        smsRegistered: function(){
            return !!getStoredSmsURI();
        },

        registerEmail: function (host, account, realm, username, email) {
            console.log('registerEmail(' + host + ', ' + account + ', ' + realm + ", " + username + ', ' + email + ')');
            return new Promise(function (resolve, reject) {
                var emailURI = getStoredEmailURI();
                if (!emailURI) {
                    emailURI = 'mailto:'+email;
                    setStoredEmailURI(emailURI);
                }
                return addCloudConfiguration(host, account, realm, username, emailURI, 'email').then(function() {
                    resolve();
                });
            });
        },

        unregisterEmail: function (host, account, realm) {
            var emailURI = getStoredEmailURI();
            if (emailURI) {
                removeStoredEmailURI();
                return deleteCloudConfiguration(host, account, realm, emailURI, 'email');
            }
        },

        emailRegistered: function(){
            return !!getStoredEmailURI();
        }
    };


})(voyent);


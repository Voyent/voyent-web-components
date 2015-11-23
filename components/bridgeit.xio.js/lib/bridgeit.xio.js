if (!('bridgeit' in window) || ('bridgeit.io' in window)) {
    throw new Error('bridgeit.xio.js requires bridgeit.js and bridgeit.io.js, please include these before bridgeit.xio.js');
}

if (!('io' in window)) {
    throw new Error('bridgeit.xio.js requires the socket.io client library.js');
}

(function (b) {

    "use strict";

    //A 'creative' way to parse a URL without requiring a separate library
    function parseURL(urlString) {
        var parser = document.createElement('a');
        parser.href = urlString;
        var pathParts = parser.pathname.split('/');
        parser.service = pathParts[1];
        parser.account = pathParts[2];
        parser.realm = pathParts[4];
        parser.namespace = '/' + parser.account + '/realms/' + parser.realm;
        return parser;
    }

    function getNamespaceGroup(groupName) {
        return b.xio.push.pushURL.namespace + '/' + groupName;
    }

    function getNamespaceGroupEvent(groupName, eventName) {
        return getNamespaceGroup(groupName) + '/' + eventName;
    }

    function getNamespaceGroupNotifyEvent(groupName) {
        return getNamespaceGroupEvent(groupName, 'notify');
    }

    var ICE_NOTIFY_BACK_KEY = "ice.notifyBack";
    var XIO_CLOUD_URI_KEY = "xio.cloudURI";

    function getStoredNotifyBackURI() {
        if (localStorage) {
            return localStorage.getItem(ICE_NOTIFY_BACK_KEY);
        }
        return null;
    }

    function getStoredCloudPushURI() {
        if (localStorage) {
            var cloudURI = localStorage.getItem(XIO_CLOUD_URI_KEY);
            if (cloudURI) {
                return cloudURI;
            }

            var notifyBack = getStoredNotifyBackURI();
            if (notifyBack) {
                setStoredCloudPushURI(notifyBack);
                return notifyBack;
            }
        }
        return null;
    }

    function setStoredCloudPushURI(cloudPushURI) {
        if (localStorage) {
            localStorage.setItem(XIO_CLOUD_URI_KEY, cloudPushURI);
        }
    }

    function removeStoredCloudPushURI(cloudPushURI) {
        if (localStorage) {
            localStorage.removeItem(XIO_CLOUD_URI_KEY);
        }
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
        return 'clouduri_' + getDatabaseId(theURI);
    }

    function getCloudPushServiceURL(host, account, realm, cloudPushURI) {
        return 'http://' + host + '/push/' +
            account + '/realms/' + realm +
            '/cloud/' + getCloudPushURIHash(cloudPushURI) +
            '?access_token=' + b.io.auth.getLastAccessToken();
    }

    function addCloudPushConfiguration(host, account, realm, username, cloudPushURI) {

        return new Promise(function (resolve, reject) {

            var pushServiceURL = getCloudPushServiceURL(host, account, realm, getCloudPushURIHash(cloudPushURI));

            var cloudPushConfig = {
                username: username,
                cloudPushURI: cloudPushURI
            };

            console.log('preparing to store cloud push configuration', pushServiceURL, cloudPushConfig);

            return b.$.post(pushServiceURL, cloudPushConfig)
                .then(function (response) {
                    console.log('cloud push configuration stored');
                    //Should we still do this?
                    //b.services.auth.updateLastActiveTimestamp();
                    resolve(response);
                })['catch'](function (error) {
                console.log('error storing cloud push configuration', error);
                reject(error);
            });
        });
    }

    function getCloudPushConfiguration(host, account, realm, cloudPushURI) {

        return new Promise(
            function (resolve, reject) {

                var pushServiceURL = getCloudPushServiceURL(host, account, realm, getCloudPushURIHash(cloudPushURI));

                console.log('preparing to get cloud push configuration', pushServiceURL);

                b.$.getJSON(pushServiceURL)
                    .then(function (response) {
                        console.log('cloud push configuration retrieved');
                        //Should we still do this?
                        //b.services.auth.updateLastActiveTimestamp();
                        resolve(response);
                    })['catch'](function (error) {
                    console.log('error getting cloud push configuration', error);
                    reject(error);
                });
            }
        );

    }

    function deleteCloudPushConfiguration(host, account, realm, cloudPushURI) {

        return new Promise(
            function (resolve, reject) {

                var pushServiceURL = getCloudPushServiceURL(host, account, realm, getCloudPushURIHash(cloudPushURI));

                console.log('preparing to get cloud push configuration', pushServiceURL);

                b.$.doDelete(pushServiceURL)
                    .then(function () {
                        console.log('cloud push configuration deleted');
                        //Should we still do this?
                        //b.services.auth.updateLastActiveTimestamp();
                        resolve();
                    })['catch'](function (error) {
                    console.log('error deleting cloud push configuration', error);
                    reject(error);
                });
            }
        );

    }

    function getGroupPushServiceURL(host, account, realm, username) {
        return 'http://' + host + '/push/' +
            account + '/realms/' + realm +
            '/group/' + username +
            '?access_token=' + b.io.auth.getLastAccessToken();
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

                b.$.post(groupPushURL, message, null, false, 'application/json')
                    .then(function (response) {
                        console.log('push notification sent');
                        //Should we still do this?
                        //b.services.auth.updateLastActiveTimestamp();
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
        if (b.xio.push.listener) {
            b.xio.push.listener(payload);
        }
    }

    //Set up the xio namespace.
    if (!b['xio']) {
        b.xio = {};
    }

    var xio = b.xio;

    xio.push = {

        connected: false,
        pushURL: null,
        client: null,
        listener: null,
        groups: [],

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
            console.log('connectionOptions', JSON.stringify(connectionOptions, null, 4));

            this.client = io('http://' + parsedURL.host, connectionOptions);

            //I don't have the scoping right, but for now I'm just setting the "outer"
            //client manually.
            xio.push.client = this.client;

            console.log('new client', this.client);

            this.client.on('connect', function () {
                console.log('client connected');
                xio.push.connected = true;
                xio.push.rejoinGroups();

                //Automatically join the group associated with this username
                xio.push.join(username);
            });

            this.client.on('reconnect', function () {
                console.log('client reconnected');
                xio.push.rejoinGroups();
            });

            this.client.on('disconnect', function () {
                xio.push.connected = false;
                console.log('client disconnected');
            });

            this.client.on('error', function (err) {
                console.log('client error', new Error(err));
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

            console.log('connecting via bridgeit.xio', JSON.stringify(connectionInfo, null, 4));

            return b.io.auth.connect(connectionInfo).then(function () {
                //Once we connect, we should be able to connect our socket.io client.
                var lastToken = b.io.auth.getLastAccessToken();
                console.log('successfully logged into services', connectionInfo.host, lastToken);
                connectionInfo.connectSocketIO(connectionInfo.pushURL, connectionInfo.username, lastToken);
            })
            .catch(function (error) {
                console.log('error connecting', error);
                //Just use a dummy token for testing when directly connected to the service.
                //connectionInfo.connectSocketIO(connectionInfo.pushURL, 'dummyToken');
            });
        },

        /**
         * Establish a connection (polling, websocket) to the Push host after bridgeit.io.auth.login() or bridgeit.io.auth.connect()
         *
         * @param {String} pushURLString The URL of the Push host
         * @param {String} username
         *
         */
        attach: function (pushURLString, username) {
            if (this.connected) {
                return;
            }
            if (!bridgeit.io.auth.isLoggedIn()) {
                console.error('cannot attach bridgeit.xio.push, bridgeit is not logged in');
            }

            this.pushURL = parseURL(pushURLString);
            console.log('parsedURL', this.pushURL);

            console.log('attaching via bridgeit.xio', JSON.stringify(this.pushURL, null, 4));

            var lastToken = b.io.auth.getLastAccessToken();
            this.connectWithToken(this.pushURL, username, lastToken);
        },

        disconnect: function () {
            b.io.auth.disconnect();

            if (this.client) {
                console.log('disconnecting socket.io client');
                this.client.disconnect();
            }
        },

        refreshConnection: function () {
            console.log('refreshing connection');
            xio.push.disconnect();
            xio.push.connectWithToken(xio.push.pushURL, b.io.auth.getLastAccessToken());
        },

        addListener: function (listener) {
            this.listener = listener;
        },

        removeListener: function () {
            this.listener = null;
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
                    return addCloudPushConfiguration(host, account, realm, username, cloudPushURI).then(function(){
                        resolve();
                    });
                }

                if (localStorage) {
                    localStorage.setItem('xio.host', host);
                    localStorage.setItem('xio.account', account);
                    localStorage.setItem('xio.realm', realm);
                    localStorage.setItem('xio.username', username);
                }
                //intercept launchFailed to report a reject, then set it back
                var origLaunchFailed = bridgeit.launchFailed;
                bridgeit.launchFailed = function(){
                    console.log('launchFailed from registerCloudPush()');
                    reject('could not launch the bridgeit client app');
                    bridgeit.launchFailed = origLaunchFailed;
                };
                window.xioCloudRegistrationCallback = function(results) {
                    console.log('global cloud registration callback called', results);
                    bridgeit.xio.push.registerCloudPush(
                        sessionStorage.getItem('xio.host'),
                        sessionStorage.getItem('xio.account'),
                        sessionStorage.getItem('xio.realm'),
                        sessionStorage.getItem('xio.username')
                    );
                    bridgeit.launchFailed = origLaunchFailed;
                    resolve();
                };
                b.register('_xioCloudRegistration', 'xioCloudRegistrationCallback');
            });
        },

        cloudPushRegistered: function(){
            return !!getStoredCloudPushURI();
        },

        //registrationCallback: function (results) {
        //    var cloudPushURI = getStoredNotifyBackURI();
        //    console.log('cloud push registration callback', 'results:', results, 'cloudPushURI:', cloudPushURI);
        //    setStoredCloudPushURI(cloudPushURI);
        //    addCloudPushConfiguration(host, account, realm, username, cloudPushURI)
        //        .then(function () {
        //            console.log('registered cloud push URI');
        //        })
        //        .catch(function (err) {
        //            console.log('error registering cloud push URI', err);
        //        });
        //},

        unregisterCloudPush: function (host, account, realm) {
            var cloudPushURI = getStoredCloudPushURI();
            if (cloudPushURI) {
                removeStoredCloudPushURI();
                return deleteCloudPushConfiguration(host, account, realm, cloudPushURI);
            }
        }
    };


})(bridgeit);


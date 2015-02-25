window.login = function(event){
	var account = document.getElementById('account').value;
	var realm = document.getElementById('realm').value;
	var username = document.getElementById('username').value;
	var password = document.getElementById('password').value;

	bridgeit.io.auth.connect({
		account: account,
		realm: realm,
		username: username,
		password: password
	}).then(function(){
		setCredentialsOnComponent();
	});
};

window.setCredentialsOnComponent = function(){

	var account = bridgeit.io.auth.getLastKnownAccount();
	var realm = bridgeit.io.auth.getLastKnownRealm();
	var token = bridgeit.io.auth.getLastAccessToken();

	var elem = document.getElementById('userLocations');
	elem.setAttribute('accessToken', token);
	elem.setAttribute('realm', realm);
	elem.setAttribute('account', account);

	document.getElementById('account').value = account;
	document.getElementById('realm').value = realm;
	document.getElementById('username').value = bridgeit.io.auth.getLastKnownUsername();
};

//initialize known credentials
setCredentialsOnComponent();
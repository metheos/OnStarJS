'use strict';

var axios = require('axios');
var require$$0 = require('tough-cookie');
var require$$0$1 = require('node:url');
var require$$0$2 = require('node:http');
var require$$0$3 = require('node:https');
var require$$0$5 = require('net');
var require$$0$4 = require('http');
var require$$1 = require('https');
var openidClient = require('openid-client');
var fs = require('fs');
var totpGenerator = require('totp-generator');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var openidClient__namespace = /*#__PURE__*/_interopNamespaceDefault(openidClient);

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

var RequestMethod;
(function (RequestMethod) {
    RequestMethod[RequestMethod["Get"] = 0] = "Get";
    RequestMethod[RequestMethod["Post"] = 1] = "Post";
})(RequestMethod || (RequestMethod = {}));
class Request {
    constructor(url) {
        this.method = RequestMethod.Post;
        this.body = "{}";
        this.contentType = "application/json; charset=UTF-8";
        this.authRequired = true;
        this.upgradeRequired = false;
        this.checkRequestStatus = null;
        this.headers = {};
        this.url = url;
    }
    getUrl() {
        return this.url;
    }
    getMethod() {
        return this.method;
    }
    setMethod(method) {
        this.method = method;
        return this;
    }
    getHeaders() {
        return this.headers;
    }
    setHeaders(headers) {
        this.headers = headers;
        return this;
    }
    getBody() {
        return this.body;
    }
    setBody(body) {
        if (typeof body === "object") {
            body = JSON.stringify(body);
        }
        this.body = body;
        return this;
    }
    isAuthRequired() {
        return this.authRequired;
    }
    setAuthRequired(authRequired) {
        this.authRequired = authRequired;
        return this;
    }
    isUpgradeRequired() {
        return this.upgradeRequired;
    }
    setUpgradeRequired(upgradeRequired) {
        this.upgradeRequired = upgradeRequired;
        return this;
    }
    getContentType() {
        return this.contentType;
    }
    setContentType(type) {
        this.contentType = type;
        return this;
    }
    getCheckRequestStatus() {
        return this.checkRequestStatus;
    }
    setCheckRequestStatus(checkStatus) {
        this.checkRequestStatus = checkStatus;
        return this;
    }
}

class RequestResult {
    constructor(status) {
        this.status = status;
    }
    setResponse(response) {
        this.response = response;
        return this;
    }
    setMessage(message) {
        this.message = message;
        return this;
    }
    getResult() {
        const result = {
            status: this.status,
        };
        if (this.response) {
            result.response = this.response;
        }
        if (this.message) {
            result.message = this.message;
        }
        return result;
    }
}

class RequestError extends Error {
    constructor(...args) {
        super(...args);
        Error.captureStackTrace(this, RequestError);
    }
    getResponse() {
        return this.response;
    }
    setResponse(response) {
        this.response = response;
        return this;
    }
    getRequest() {
        return this.request;
    }
    setRequest(request) {
        this.request = request;
        return this;
    }
}

var CommandResponseStatus;
(function (CommandResponseStatus) {
    CommandResponseStatus["success"] = "success";
    CommandResponseStatus["failure"] = "failure";
    CommandResponseStatus["inProgress"] = "inProgress";
})(CommandResponseStatus || (CommandResponseStatus = {}));
var AlertRequestAction;
(function (AlertRequestAction) {
    AlertRequestAction["Honk"] = "Honk";
    AlertRequestAction["Flash"] = "Flash";
})(AlertRequestAction || (AlertRequestAction = {}));
var AlertRequestOverride;
(function (AlertRequestOverride) {
    AlertRequestOverride["DoorOpen"] = "DoorOpen";
    AlertRequestOverride["IgnitionOn"] = "IgnitionOn";
})(AlertRequestOverride || (AlertRequestOverride = {}));
var DiagnosticRequestItem;
(function (DiagnosticRequestItem) {
    DiagnosticRequestItem["AmbientAirTemperature"] = "AMBIENT AIR TEMPERATURE";
    DiagnosticRequestItem["EngineCoolantTemp"] = "ENGINE COOLANT TEMP";
    DiagnosticRequestItem["EngineRpm"] = "ENGINE RPM";
    DiagnosticRequestItem["EvBatteryLevel"] = "EV BATTERY LEVEL";
    DiagnosticRequestItem["EvChargeState"] = "EV CHARGE STATE";
    DiagnosticRequestItem["EvEstimatedChargeEnd"] = "EV ESTIMATED CHARGE END";
    DiagnosticRequestItem["EvPlugState"] = "EV PLUG STATE";
    DiagnosticRequestItem["EvPlugVoltage"] = "EV PLUG VOLTAGE";
    DiagnosticRequestItem["EvScheduledChargeStart"] = "EV SCHEDULED CHARGE START";
    DiagnosticRequestItem["FuelTankInfo"] = "FUEL TANK INFO";
    DiagnosticRequestItem["GetChargeMode"] = "GET CHARGE MODE";
    DiagnosticRequestItem["GetCommuteSchedule"] = "GET COMMUTE SCHEDULE";
    DiagnosticRequestItem["HandsFreeCalling"] = "HANDS FREE CALLING";
    DiagnosticRequestItem["HotspotConfig"] = "HOTSPOT CONFIG";
    DiagnosticRequestItem["HotspotStatus"] = "HOTSPOT STATUS";
    DiagnosticRequestItem["IntermVoltBattVolt"] = "INTERM VOLT BATT VOLT";
    DiagnosticRequestItem["LastTripDistance"] = "LAST TRIP DISTANCE";
    DiagnosticRequestItem["LastTripFuelEconomy"] = "LAST TRIP FUEL ECONOMY";
    DiagnosticRequestItem["LifetimeEvOdometer"] = "LIFETIME EV ODOMETER";
    DiagnosticRequestItem["LifetimeFuelEcon"] = "LIFETIME FUEL ECON";
    DiagnosticRequestItem["LifetimeFuelUsed"] = "LIFETIME FUEL USED";
    DiagnosticRequestItem["Odometer"] = "ODOMETER";
    DiagnosticRequestItem["OilLife"] = "OIL LIFE";
    DiagnosticRequestItem["TirePressure"] = "TIRE PRESSURE";
    DiagnosticRequestItem["VehicleRange"] = "VEHICLE RANGE";
})(DiagnosticRequestItem || (DiagnosticRequestItem = {}));
var ChargingProfileChargeMode;
(function (ChargingProfileChargeMode) {
    ChargingProfileChargeMode["DefaultImmediate"] = "DEFAULT_IMMEDIATE";
    ChargingProfileChargeMode["Immediate"] = "IMMEDIATE";
    ChargingProfileChargeMode["DepartureBased"] = "DEPARTURE_BASED";
    ChargingProfileChargeMode["RateBased"] = "RATE_BASED";
    ChargingProfileChargeMode["PhevAfterMidnight"] = "PHEV_AFTER_MIDNIGHT";
})(ChargingProfileChargeMode || (ChargingProfileChargeMode = {}));
var ChargingProfileRateType;
(function (ChargingProfileRateType) {
    ChargingProfileRateType["Offpeak"] = "OFFPEAK";
    ChargingProfileRateType["Midpeak"] = "MIDPEAK";
    ChargingProfileRateType["Peak"] = "PEAK";
})(ChargingProfileRateType || (ChargingProfileRateType = {}));
var ChargeOverrideMode;
(function (ChargeOverrideMode) {
    ChargeOverrideMode["ChargeNow"] = "CHARGE_NOW";
    ChargeOverrideMode["CancelOverride"] = "CANCEL_OVERRIDE";
})(ChargeOverrideMode || (ChargeOverrideMode = {}));

var appId = "OMB_CVY_iOS_6Z0";
var appSecret = "tCujQXR8nvPhewodWMPrUNExBK4dmCmBAfMb";
var optionalClientScope = "";
var requiredClientScope = "onstar gmoc user_trailer user priv";
var serviceUrl = "https://na-mobile-api.gm.com";
var userAgent = "myChevrolet/118 CFNetwork/1408.0.4 Darwin/22.5.0";
var onStarAppConfig = {
	appId: appId,
	appSecret: appSecret,
	optionalClientScope: optionalClientScope,
	requiredClientScope: requiredClientScope,
	serviceUrl: serviceUrl,
	userAgent: userAgent
};

var http$1 = {};

var create_cookie_agent = {};

var create_cookie_header_value = {};

var hasRequiredCreate_cookie_header_value;

function requireCreate_cookie_header_value () {
	if (hasRequiredCreate_cookie_header_value) return create_cookie_header_value;
	hasRequiredCreate_cookie_header_value = 1;

	Object.defineProperty(create_cookie_header_value, "__esModule", {
	  value: true
	});
	create_cookie_header_value.createCookieHeaderValue = createCookieHeaderValue;
	var _toughCookie = require$$0;
	function createCookieHeaderValue({
	  cookieOptions,
	  passedValues,
	  requestUrl
	}) {
	  const {
	    jar
	  } = cookieOptions;
	  const cookies = jar.getCookiesSync(requestUrl);
	  const cookiesMap = new Map(cookies.map(cookie => [cookie.key, cookie]));
	  for (const passedValue of passedValues) {
	    if (typeof passedValue !== 'string') {
	      continue;
	    }
	    for (const str of passedValue.split(';')) {
	      const cookie = _toughCookie.Cookie.parse(str.trim());
	      if (cookie != null) {
	        cookiesMap.set(cookie.key, cookie);
	      }
	    }
	  }
	  const cookieHeaderValue = Array.from(cookiesMap.values()).map(cookie => cookie.cookieString()).join(';\x20');
	  return cookieHeaderValue;
	}
	return create_cookie_header_value;
}

var save_cookies_from_header = {};

var hasRequiredSave_cookies_from_header;

function requireSave_cookies_from_header () {
	if (hasRequiredSave_cookies_from_header) return save_cookies_from_header;
	hasRequiredSave_cookies_from_header = 1;

	Object.defineProperty(save_cookies_from_header, "__esModule", {
	  value: true
	});
	save_cookies_from_header.saveCookiesFromHeader = saveCookiesFromHeader;
	function saveCookiesFromHeader({
	  cookieOptions,
	  cookies,
	  requestUrl
	}) {
	  const {
	    jar
	  } = cookieOptions;
	  for (const cookie of [cookies].flat()) {
	    if (cookie == null) {
	      continue;
	    }
	    jar.setCookieSync(cookie, requestUrl, {
	      ignoreError: true
	    });
	  }
	}
	return save_cookies_from_header;
}

var validate_cookie_options = {};

var hasRequiredValidate_cookie_options;

function requireValidate_cookie_options () {
	if (hasRequiredValidate_cookie_options) return validate_cookie_options;
	hasRequiredValidate_cookie_options = 1;

	Object.defineProperty(validate_cookie_options, "__esModule", {
	  value: true
	});
	validate_cookie_options.validateCookieOptions = validateCookieOptions;
	function validateCookieOptions(opts) {
	  if (!('jar' in opts)) {
	    throw new TypeError('invalid cookies.jar');
	  }
	  if (!opts.jar.store.synchronous) {
	    throw new TypeError('an asynchronous cookie store is not supported.');
	  }
	}
	return validate_cookie_options;
}

var hasRequiredCreate_cookie_agent;

function requireCreate_cookie_agent () {
	if (hasRequiredCreate_cookie_agent) return create_cookie_agent;
	hasRequiredCreate_cookie_agent = 1;

	Object.defineProperty(create_cookie_agent, "__esModule", {
	  value: true
	});
	create_cookie_agent.createCookieAgent = createCookieAgent;
	var _nodeUrl = _interopRequireDefault(require$$0$1);
	var _create_cookie_header_value = requireCreate_cookie_header_value();
	var _save_cookies_from_header = requireSave_cookies_from_header();
	var _validate_cookie_options = requireValidate_cookie_options();
	function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
	const kCookieOptions = Symbol('cookieOptions');
	const kReimplicitHeader = Symbol('reimplicitHeader');
	const kRecreateFirstChunk = Symbol('recreateFirstChunk');
	const kOverrideRequest = Symbol('overrideRequest');
	function createCookieAgent(BaseAgentClass) {
	  // @ts-expect-error -- BaseAgentClass is type definition.
	  class CookieAgent extends BaseAgentClass {
	    constructor(...params) {
	      const {
	        cookies: cookieOptions
	      } = params.find(opt => {
	        return opt != null && typeof opt === 'object' && 'cookies' in opt;
	      }) ?? {};
	      super(...params);
	      if (cookieOptions) {
	        (0, _validate_cookie_options.validateCookieOptions)(cookieOptions);
	      }
	      this[kCookieOptions] = cookieOptions;
	    }
	    [kReimplicitHeader](req) {
	      const _headerSent = req._headerSent;
	      req._header = null;
	      req._implicitHeader();
	      req._headerSent = _headerSent;
	    }
	    [kRecreateFirstChunk](req) {
	      const firstChunk = req.outputData[0];
	      if (req._header == null || firstChunk == null) {
	        return;
	      }
	      const prevData = firstChunk.data;
	      const prevHeaderLength = prevData.indexOf('\r\n\r\n');
	      if (prevHeaderLength === -1) {
	        firstChunk.data = req._header;
	      } else {
	        firstChunk.data = `${req._header}${prevData.slice(prevHeaderLength + 4)}`;
	      }
	      const diffSize = firstChunk.data.length - prevData.length;
	      req.outputSize += diffSize;
	      req._onPendingData(diffSize);
	    }
	    [kOverrideRequest](req, requestUrl, cookieOptions) {
	      const _implicitHeader = req._implicitHeader.bind(req);
	      req._implicitHeader = () => {
	        try {
	          const cookieHeader = (0, _create_cookie_header_value.createCookieHeaderValue)({
	            cookieOptions,
	            passedValues: [req.getHeader('Cookie')].flat(),
	            requestUrl
	          });
	          if (cookieHeader) {
	            req.setHeader('Cookie', cookieHeader);
	          }
	        } catch (err) {
	          req.destroy(err);
	          return;
	        }
	        _implicitHeader();
	      };
	      const emit = req.emit.bind(req);
	      req.emit = (event, ...args) => {
	        if (event === 'response') {
	          try {
	            const res = args[0];
	            (0, _save_cookies_from_header.saveCookiesFromHeader)({
	              cookieOptions,
	              cookies: res.headers['set-cookie'],
	              requestUrl
	            });
	          } catch (err) {
	            req.destroy(err);
	            return false;
	          }
	        }
	        return emit(event, ...args);
	      };
	    }
	    addRequest(req, options) {
	      const cookieOptions = this[kCookieOptions];
	      if (cookieOptions) {
	        try {
	          const requestUrl = _nodeUrl.default.format({
	            host: req.host,
	            pathname: req.path,
	            protocol: req.protocol
	          });
	          this[kOverrideRequest](req, requestUrl, cookieOptions);
	          if (req._header != null) {
	            this[kReimplicitHeader](req);
	          }
	          if (req._headerSent) {
	            this[kRecreateFirstChunk](req);
	          }
	        } catch (err) {
	          req.destroy(err);
	          return;
	        }
	      }
	      super.addRequest(req, options);
	    }
	  }
	  return CookieAgent;
	}
	return create_cookie_agent;
}

var http_cookie_agent = {};

var hasRequiredHttp_cookie_agent;

function requireHttp_cookie_agent () {
	if (hasRequiredHttp_cookie_agent) return http_cookie_agent;
	hasRequiredHttp_cookie_agent = 1;

	Object.defineProperty(http_cookie_agent, "__esModule", {
	  value: true
	});
	http_cookie_agent.HttpCookieAgent = void 0;
	var _nodeHttp = _interopRequireDefault(require$$0$2);
	var _create_cookie_agent = requireCreate_cookie_agent();
	function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
	http_cookie_agent.HttpCookieAgent = (0, _create_cookie_agent.createCookieAgent)(_nodeHttp.default.Agent);
	return http_cookie_agent;
}

var https_cookie_agent = {};

var hasRequiredHttps_cookie_agent;

function requireHttps_cookie_agent () {
	if (hasRequiredHttps_cookie_agent) return https_cookie_agent;
	hasRequiredHttps_cookie_agent = 1;

	Object.defineProperty(https_cookie_agent, "__esModule", {
	  value: true
	});
	https_cookie_agent.HttpsCookieAgent = void 0;
	var _nodeHttps = _interopRequireDefault(require$$0$3);
	var _create_cookie_agent = requireCreate_cookie_agent();
	function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
	https_cookie_agent.HttpsCookieAgent = (0, _create_cookie_agent.createCookieAgent)(_nodeHttps.default.Agent);
	return https_cookie_agent;
}

var mixed_cookie_agent = {};

var dist = {};

var helpers = {};

var hasRequiredHelpers;

function requireHelpers () {
	if (hasRequiredHelpers) return helpers;
	hasRequiredHelpers = 1;
	var __createBinding = (helpers && helpers.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    var desc = Object.getOwnPropertyDescriptor(m, k);
	    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
	      desc = { enumerable: true, get: function() { return m[k]; } };
	    }
	    Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __setModuleDefault = (helpers && helpers.__setModuleDefault) || (Object.create ? (function(o, v) {
	    Object.defineProperty(o, "default", { enumerable: true, value: v });
	}) : function(o, v) {
	    o["default"] = v;
	});
	var __importStar = (helpers && helpers.__importStar) || function (mod) {
	    if (mod && mod.__esModule) return mod;
	    var result = {};
	    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
	    __setModuleDefault(result, mod);
	    return result;
	};
	Object.defineProperty(helpers, "__esModule", { value: true });
	helpers.req = helpers.json = helpers.toBuffer = void 0;
	const http = __importStar(require$$0$4);
	const https = __importStar(require$$1);
	async function toBuffer(stream) {
	    let length = 0;
	    const chunks = [];
	    for await (const chunk of stream) {
	        length += chunk.length;
	        chunks.push(chunk);
	    }
	    return Buffer.concat(chunks, length);
	}
	helpers.toBuffer = toBuffer;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function json(stream) {
	    const buf = await toBuffer(stream);
	    const str = buf.toString('utf8');
	    try {
	        return JSON.parse(str);
	    }
	    catch (_err) {
	        const err = _err;
	        err.message += ` (input: ${str})`;
	        throw err;
	    }
	}
	helpers.json = json;
	function req(url, opts = {}) {
	    const href = typeof url === 'string' ? url : url.href;
	    const req = (href.startsWith('https:') ? https : http).request(url, opts);
	    const promise = new Promise((resolve, reject) => {
	        req
	            .once('response', resolve)
	            .once('error', reject)
	            .end();
	    });
	    req.then = promise.then.bind(promise);
	    return req;
	}
	helpers.req = req;
	
	return helpers;
}

var hasRequiredDist;

function requireDist () {
	if (hasRequiredDist) return dist;
	hasRequiredDist = 1;
	(function (exports) {
		var __createBinding = (dist && dist.__createBinding) || (Object.create ? (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    var desc = Object.getOwnPropertyDescriptor(m, k);
		    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
		      desc = { enumerable: true, get: function() { return m[k]; } };
		    }
		    Object.defineProperty(o, k2, desc);
		}) : (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    o[k2] = m[k];
		}));
		var __setModuleDefault = (dist && dist.__setModuleDefault) || (Object.create ? (function(o, v) {
		    Object.defineProperty(o, "default", { enumerable: true, value: v });
		}) : function(o, v) {
		    o["default"] = v;
		});
		var __importStar = (dist && dist.__importStar) || function (mod) {
		    if (mod && mod.__esModule) return mod;
		    var result = {};
		    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
		    __setModuleDefault(result, mod);
		    return result;
		};
		var __exportStar = (dist && dist.__exportStar) || function(m, exports) {
		    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
		};
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.Agent = void 0;
		const net = __importStar(require$$0$5);
		const http = __importStar(require$$0$4);
		const https_1 = require$$1;
		__exportStar(requireHelpers(), exports);
		const INTERNAL = Symbol('AgentBaseInternalState');
		class Agent extends http.Agent {
		    constructor(opts) {
		        super(opts);
		        this[INTERNAL] = {};
		    }
		    /**
		     * Determine whether this is an `http` or `https` request.
		     */
		    isSecureEndpoint(options) {
		        if (options) {
		            // First check the `secureEndpoint` property explicitly, since this
		            // means that a parent `Agent` is "passing through" to this instance.
		            // eslint-disable-next-line @typescript-eslint/no-explicit-any
		            if (typeof options.secureEndpoint === 'boolean') {
		                return options.secureEndpoint;
		            }
		            // If no explicit `secure` endpoint, check if `protocol` property is
		            // set. This will usually be the case since using a full string URL
		            // or `URL` instance should be the most common usage.
		            if (typeof options.protocol === 'string') {
		                return options.protocol === 'https:';
		            }
		        }
		        // Finally, if no `protocol` property was set, then fall back to
		        // checking the stack trace of the current call stack, and try to
		        // detect the "https" module.
		        const { stack } = new Error();
		        if (typeof stack !== 'string')
		            return false;
		        return stack
		            .split('\n')
		            .some((l) => l.indexOf('(https.js:') !== -1 ||
		            l.indexOf('node:https:') !== -1);
		    }
		    // In order to support async signatures in `connect()` and Node's native
		    // connection pooling in `http.Agent`, the array of sockets for each origin
		    // has to be updated synchronously. This is so the length of the array is
		    // accurate when `addRequest()` is next called. We achieve this by creating a
		    // fake socket and adding it to `sockets[origin]` and incrementing
		    // `totalSocketCount`.
		    incrementSockets(name) {
		        // If `maxSockets` and `maxTotalSockets` are both Infinity then there is no
		        // need to create a fake socket because Node.js native connection pooling
		        // will never be invoked.
		        if (this.maxSockets === Infinity && this.maxTotalSockets === Infinity) {
		            return null;
		        }
		        // All instances of `sockets` are expected TypeScript errors. The
		        // alternative is to add it as a private property of this class but that
		        // will break TypeScript subclassing.
		        if (!this.sockets[name]) {
		            // @ts-expect-error `sockets` is readonly in `@types/node`
		            this.sockets[name] = [];
		        }
		        const fakeSocket = new net.Socket({ writable: false });
		        this.sockets[name].push(fakeSocket);
		        // @ts-expect-error `totalSocketCount` isn't defined in `@types/node`
		        this.totalSocketCount++;
		        return fakeSocket;
		    }
		    decrementSockets(name, socket) {
		        if (!this.sockets[name] || socket === null) {
		            return;
		        }
		        const sockets = this.sockets[name];
		        const index = sockets.indexOf(socket);
		        if (index !== -1) {
		            sockets.splice(index, 1);
		            // @ts-expect-error  `totalSocketCount` isn't defined in `@types/node`
		            this.totalSocketCount--;
		            if (sockets.length === 0) {
		                // @ts-expect-error `sockets` is readonly in `@types/node`
		                delete this.sockets[name];
		            }
		        }
		    }
		    // In order to properly update the socket pool, we need to call `getName()` on
		    // the core `https.Agent` if it is a secureEndpoint.
		    getName(options) {
		        const secureEndpoint = typeof options.secureEndpoint === 'boolean'
		            ? options.secureEndpoint
		            : this.isSecureEndpoint(options);
		        if (secureEndpoint) {
		            // @ts-expect-error `getName()` isn't defined in `@types/node`
		            return https_1.Agent.prototype.getName.call(this, options);
		        }
		        // @ts-expect-error `getName()` isn't defined in `@types/node`
		        return super.getName(options);
		    }
		    createSocket(req, options, cb) {
		        const connectOpts = {
		            ...options,
		            secureEndpoint: this.isSecureEndpoint(options),
		        };
		        const name = this.getName(connectOpts);
		        const fakeSocket = this.incrementSockets(name);
		        Promise.resolve()
		            .then(() => this.connect(req, connectOpts))
		            .then((socket) => {
		            this.decrementSockets(name, fakeSocket);
		            if (socket instanceof http.Agent) {
		                // @ts-expect-error `addRequest()` isn't defined in `@types/node`
		                return socket.addRequest(req, connectOpts);
		            }
		            this[INTERNAL].currentSocket = socket;
		            // @ts-expect-error `createSocket()` isn't defined in `@types/node`
		            super.createSocket(req, options, cb);
		        }, (err) => {
		            this.decrementSockets(name, fakeSocket);
		            cb(err);
		        });
		    }
		    createConnection() {
		        const socket = this[INTERNAL].currentSocket;
		        this[INTERNAL].currentSocket = undefined;
		        if (!socket) {
		            throw new Error('No socket was returned in the `connect()` function');
		        }
		        return socket;
		    }
		    get defaultPort() {
		        return (this[INTERNAL].defaultPort ??
		            (this.protocol === 'https:' ? 443 : 80));
		    }
		    set defaultPort(v) {
		        if (this[INTERNAL]) {
		            this[INTERNAL].defaultPort = v;
		        }
		    }
		    get protocol() {
		        return (this[INTERNAL].protocol ??
		            (this.isSecureEndpoint() ? 'https:' : 'http:'));
		    }
		    set protocol(v) {
		        if (this[INTERNAL]) {
		            this[INTERNAL].protocol = v;
		        }
		    }
		}
		exports.Agent = Agent;
		
	} (dist));
	return dist;
}

var hasRequiredMixed_cookie_agent;

function requireMixed_cookie_agent () {
	if (hasRequiredMixed_cookie_agent) return mixed_cookie_agent;
	hasRequiredMixed_cookie_agent = 1;

	Object.defineProperty(mixed_cookie_agent, "__esModule", {
	  value: true
	});
	mixed_cookie_agent.MixedCookieAgent = void 0;
	var _agentBase = requireDist();
	var _http_cookie_agent = requireHttp_cookie_agent();
	var _https_cookie_agent = requireHttps_cookie_agent();
	class MixedCookieAgent extends _agentBase.Agent {
	  constructor(options) {
	    super();
	    this._httpAgent = new _http_cookie_agent.HttpCookieAgent(options);
	    this._httpsAgent = new _https_cookie_agent.HttpsCookieAgent(options);
	  }
	  connect(_req, options) {
	    return options.secureEndpoint ? this._httpsAgent : this._httpAgent;
	  }
	}
	mixed_cookie_agent.MixedCookieAgent = MixedCookieAgent;
	return mixed_cookie_agent;
}

var hasRequiredHttp$1;

function requireHttp$1 () {
	if (hasRequiredHttp$1) return http$1;
	hasRequiredHttp$1 = 1;
	(function (exports) {

		Object.defineProperty(exports, "__esModule", {
		  value: true
		});
		Object.defineProperty(exports, "HttpCookieAgent", {
		  enumerable: true,
		  get: function () {
		    return _http_cookie_agent.HttpCookieAgent;
		  }
		});
		Object.defineProperty(exports, "HttpsCookieAgent", {
		  enumerable: true,
		  get: function () {
		    return _https_cookie_agent.HttpsCookieAgent;
		  }
		});
		Object.defineProperty(exports, "MixedCookieAgent", {
		  enumerable: true,
		  get: function () {
		    return _mixed_cookie_agent.MixedCookieAgent;
		  }
		});
		Object.defineProperty(exports, "createCookieAgent", {
		  enumerable: true,
		  get: function () {
		    return _create_cookie_agent.createCookieAgent;
		  }
		});
		var _create_cookie_agent = requireCreate_cookie_agent();
		var _http_cookie_agent = requireHttp_cookie_agent();
		var _https_cookie_agent = requireHttps_cookie_agent();
		var _mixed_cookie_agent = requireMixed_cookie_agent(); 
	} (http$1));
	return http$1;
}

var http;
var hasRequiredHttp;

function requireHttp () {
	if (hasRequiredHttp) return http;
	hasRequiredHttp = 1;
	http = requireHttp$1();
	return http;
}

var httpExports = requireHttp();

class GMAuth {
    constructor(config) {
        this.currentGMAPIToken = null;
        this.config = config;
        this.MSTokenPath = "./microsoft_tokens.json";
        this.GMTokenPath = "./gm_tokens.json";
        this.oidc = {
            Issuer: openidClient__namespace.Issuer,
            generators: openidClient__namespace.generators,
        };
        this.jar = new require$$0.CookieJar();
        this.axiosClient = axios.create({
            httpAgent: new httpExports.HttpCookieAgent({ cookies: { jar: this.jar } }),
            httpsAgent: new httpExports.HttpsCookieAgent({ cookies: { jar: this.jar } }),
        });
        this.csrfToken = null;
        this.transId = null;
        // Load the current GM API token
        this.loadCurrentGMAPIToken();
    }
    authenticate() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let loadedTokenSet = yield this.loadAccessToken();
                if (loadedTokenSet !== false) {
                    // console.log("Using existing MS tokens");
                    return yield this.getGMAPIToken(loadedTokenSet);
                }
                // console.log("Performing full authentication");
                yield this.doFullAuthSequence();
                loadedTokenSet = yield this.loadAccessToken();
                if (!loadedTokenSet)
                    throw new Error("Failed to load MS token set");
                return yield this.getGMAPIToken(loadedTokenSet);
            }
            catch (error) {
                console.error("Authentication failed:", error);
                throw error;
            }
        });
    }
    doFullAuthSequence() {
        return __awaiter(this, void 0, void 0, function* () {
            const { authorizationUrl, code_verifier } = yield this.startAuthorizationFlow();
            const authResponse = yield this.getRequest(authorizationUrl);
            this.csrfToken = this.getRegexMatch(authResponse.data, `\"csrf\":\"(.*?)\"`);
            this.transId = this.getRegexMatch(authResponse.data, `\"transId\":\"(.*?)\"`);
            if (!this.csrfToken || !this.transId) {
                throw new Error("Failed to extract csrf token or transId");
            }
            yield this.submitCredentials();
            yield this.handleMFA();
            const authCode = yield this.getAuthorizationCode();
            if (!authCode)
                throw new Error("Failed to get authorization code");
            const tokenSet = yield this.getAccessToken(authCode, code_verifier);
            yield this.saveTokens(tokenSet);
            return tokenSet;
        });
    }
    saveTokens(tokenSet) {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log("Saving MS tokens to ", this.MSTokenPath);
            fs.writeFileSync(this.MSTokenPath, JSON.stringify(tokenSet));
            // Save the GM API token as well
            if (this.currentGMAPIToken) {
                const tokenFilePath = this.GMTokenPath; // Define the path for the token file
                fs.writeFileSync(tokenFilePath, JSON.stringify(this.currentGMAPIToken));
                // console.log("Saved current GM API token to ", tokenFilePath);
            }
        });
    }
    getAuthorizationCode() {
        return __awaiter(this, void 0, void 0, function* () {
            const authCodeRequestURL = `https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn/api/SelfAsserted/confirmed?csrf_token=${this.csrfToken}&tx=${this.transId}&p=B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn`;
            const authResponse = yield this.captureRedirectLocation(authCodeRequestURL);
            return this.getRegexMatch(authResponse, `code=(.*)`);
        });
    }
    handleMFA() {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log("Loading MFA Page");
            const mfaRequestURL = `https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn/api/CombinedSigninAndSignup/confirmed?rememberMe=true&csrf_token=${this.csrfToken}&tx=${this.transId}&p=B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn`;
            const authResponse = yield this.getRequest(mfaRequestURL);
            this.csrfToken = this.getRegexMatch(authResponse.data, `\"csrf\":\"(.*?)\"`);
            this.transId = this.getRegexMatch(authResponse.data, `\"transId\":\"(.*?)\"`);
            if (!this.csrfToken || !this.transId) {
                throw new Error("Failed to extract csrf token or transId during MFA");
            }
            const { otp } = totpGenerator.TOTP.generate(this.config.totpKey, {
                digits: 6,
                algorithm: "SHA-1",
                period: 30,
            });
            // console.log("Submitting OTP Code:", otp);
            const postMFACodeRespURL = `https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn/SelfAsserted?tx=${this.transId}&p=B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn`;
            const MFACodeDataResp = {
                otpCode: otp,
                request_type: "RESPONSE",
            };
            yield this.postRequest(postMFACodeRespURL, MFACodeDataResp, this.csrfToken);
        });
    }
    submitCredentials() {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log("Sending GM login credentials");
            const cpe1Url = `https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn/SelfAsserted?tx=${this.transId}&p=B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn`;
            const cpe1Data = {
                request_type: "RESPONSE",
                logonIdentifier: this.config.username,
                password: this.config.password,
            };
            yield this.postRequest(cpe1Url, cpe1Data, this.csrfToken);
        });
    }
    static authTokenIsValid(authToken) {
        return authToken.expires_at > Date.now() + 5 * 60 * 1000;
    }
    loadCurrentGMAPIToken() {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log("Loading existing GM API token, if it exists.");
            const tokenFilePath = this.GMTokenPath; // Define the path for the token file
            if (fs.existsSync(tokenFilePath)) {
                try {
                    const storedToken = JSON.parse(fs.readFileSync(tokenFilePath, "utf-8"));
                    const now = Math.floor(Date.now() / 1000);
                    // Check if the token is still valid
                    if (storedToken.expires_at && storedToken.expires_at > now) {
                        // console.log("Loaded existing GM API token");
                        this.currentGMAPIToken = storedToken;
                    }
                    else {
                        // console.log("Existing GM API token has expired");
                    }
                }
                catch (err) {
                    console.error("Error loading stored GM API token:", err);
                }
            }
        });
    }
    getGMAPIToken(tokenSet) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if we already have a valid token
            const now = Math.floor(Date.now() / 1000);
            if (this.currentGMAPIToken &&
                this.currentGMAPIToken.expires_at > now + 60) {
                // console.log("Returning existing GM API token");
                return this.currentGMAPIToken;
            }
            // console.log("Requesting GM API Token using MS Access Token");
            const url = "https://na-mobile-api.gm.com/sec/authz/v3/oauth/token";
            try {
                const response = yield this.axiosClient.post(url, {
                    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
                    subject_token: tokenSet.access_token,
                    subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
                    scope: "msso role_owner priv onstar gmoc user user_trailer",
                    device_id: this.config.deviceId,
                }, {
                    withCredentials: true,
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        accept: "application/json",
                    },
                });
                const expires_at = Math.floor(Date.now() / 1000) +
                    parseInt(response.data.expires_in.toString());
                response.data.expires_in = parseInt(response.data.expires_in.toString());
                response.data.expires_at = expires_at;
                // console.log("Set GM Token expiration to ", expires_at);
                // Store the new token
                this.currentGMAPIToken = response.data;
                this.saveTokens(tokenSet);
                return response.data;
            }
            catch (error) {
                if (error.response) {
                    console.error(`GM API Token Error ${error.response.status}: ${error.response.statusText}`);
                    console.error("Error details:", error.response.data);
                    if (error.response.status === 401) {
                        console.error("Token exchange failed. MS Access token may be invalid.");
                    }
                }
                else if (error.request) {
                    console.error("No response received from GM API");
                    console.error(error.request);
                }
                else {
                    console.error("Request Error:", error.message);
                }
                throw error;
            }
        });
    }
    getRequest(url) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield this.axiosClient.get(url, {
                    withCredentials: true,
                    maxRedirects: 0,
                });
                // console.log("Response Status:", response.status);
                return response;
            }
            catch (error) {
                this.handleRequestError(error);
                throw error;
            }
        });
    }
    postRequest(url, postData, csrfToken) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield this.axiosClient.post(url, postData, {
                    withCredentials: true,
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        accept: "application/json, text/javascript, */*; q=0.01",
                        origin: "https://custlogin.gm.com",
                        "x-csrf-token": csrfToken,
                    },
                });
                // console.log("Response Status:", response.status);
                return response;
            }
            catch (error) {
                this.handleRequestError(error);
                throw error;
            }
        });
    }
    handleRequestError(error) {
        if (error.response) {
            console.error(`HTTP Error ${error.response.status}: ${error.response.statusText}`);
            console.error("Response data:", error.response.data);
            if (error.response.status === 401) {
                console.error("Authentication failed. Please check your credentials.");
            }
        }
        else if (error.request) {
            console.error("No response received from server");
            console.error(error.request);
        }
        else {
            console.error("Request Error:", error.message);
        }
    }
    getRegexMatch(haystack, regexString) {
        const re = new RegExp(regexString);
        const r = haystack.match(re);
        return r ? r[1] : null;
    }
    captureRedirectLocation(url) {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log("Requesting PKCE code");
            try {
                const response = yield this.axiosClient.get(url, {
                    maxRedirects: 0,
                    validateStatus: (status) => status >= 200 && status < 400,
                });
                if (response.status === 302) {
                    const redirectLocation = response.headers["location"];
                    if (!redirectLocation) {
                        throw new Error("No redirect location found in response headers");
                    }
                    return redirectLocation;
                }
                throw new Error(`Unexpected response status: ${response.status}`);
            }
            catch (error) {
                this.handleRequestError(error);
                throw error;
            }
        });
    }
    setupClient() {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log("Doing auth discovery");
            const issuer = yield this.oidc.Issuer.discover("https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/b2c_1a_seamless_mobile_signuporsignin/v2.0/.well-known/openid-configuration");
            return new issuer.Client({
                client_id: "3ff30506-d242-4bed-835b-422bf992622e",
                redirect_uris: ["msauth.com.gm.myChevrolet://auth"],
                response_types: ["code"],
                token_endpoint_auth_method: "none",
            });
        });
    }
    startAuthorizationFlow() {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log("Starting PKCE auth");
            const client = yield this.setupClient();
            const code_verifier = this.oidc.generators.codeVerifier();
            const code_challenge = this.oidc.generators.codeChallenge(code_verifier);
            const authorizationUrl = client.authorizationUrl({
                scope: "https://gmb2cprod.onmicrosoft.com/3ff30506-d242-4bed-835b-422bf992622e/Test.Read openid profile offline_access",
                code_challenge,
                code_challenge_method: "S256",
            });
            return { authorizationUrl, code_verifier };
        });
    }
    getAccessToken(code, code_verifier) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = yield this.setupClient();
            try {
                const openIdTokenSet = yield client.callback("msauth.com.gm.myChevrolet://auth", { code }, { code_verifier });
                // Validate that we received the required tokens
                if (!openIdTokenSet.access_token) {
                    throw new Error("No access token received from authentication provider");
                }
                // Convert the openid-client TokenSet to our TokenSet format
                const tokenSet = Object.assign(Object.assign(Object.assign(Object.assign({ access_token: openIdTokenSet.access_token }, (openIdTokenSet.id_token && { id_token: openIdTokenSet.id_token })), (openIdTokenSet.refresh_token && {
                    refresh_token: openIdTokenSet.refresh_token,
                })), (openIdTokenSet.expires_at && {
                    expires_at: openIdTokenSet.expires_at,
                })), (openIdTokenSet.expires_in && {
                    expires_in: openIdTokenSet.expires_in,
                }));
                // console.log("Access Token:", tokenSet.access_token);
                // console.log("ID Token:", tokenSet.id_token);
                return tokenSet;
            }
            catch (err) {
                console.error("Failed to obtain access token:", err);
                throw err;
            }
        });
    }
    loadAccessToken() {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log("Loading existing MS tokens, if they exist.");
            let tokenSet;
            if (fs.existsSync(this.MSTokenPath)) {
                let storedTokens = null;
                try {
                    storedTokens = JSON.parse(fs.readFileSync(this.MSTokenPath, "utf-8"));
                }
                catch (err) {
                    console.error("Error parsing stored tokens:", err);
                    throw err;
                }
                const now = Math.floor(Date.now() / 1000);
                if (storedTokens.expires_at && storedTokens.expires_at > now) {
                    // console.log("MS Access token is still valid");
                    tokenSet = storedTokens;
                }
                else if (storedTokens.refresh_token) {
                    // console.log("Refreshing MS access token");
                    const client = yield this.setupClient();
                    const refreshedTokens = yield client.refresh(storedTokens.refresh_token);
                    // Verify that the refreshed tokens contain the required access_token
                    if (!refreshedTokens.access_token) {
                        throw new Error("Refresh token response missing access_token");
                    }
                    // Create a valid TokenSet object
                    tokenSet = {
                        access_token: refreshedTokens.access_token,
                        refresh_token: refreshedTokens.refresh_token,
                        id_token: refreshedTokens.id_token,
                        expires_in: refreshedTokens.expires_in,
                        expires_at: refreshedTokens.expires_at,
                    };
                    // console.log("Saving current MS tokens to ", this.MSTokenPath);
                    fs.writeFileSync(this.MSTokenPath, JSON.stringify(tokenSet));
                }
                else {
                    throw new Error("Token expired and no refresh token available.");
                }
                return tokenSet;
            }
            return false;
        });
    }
}
function getGMAPIJWT(config) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!config.username ||
            !config.password ||
            !config.deviceId ||
            !config.totpKey) {
            throw new Error("Missing required configuration parameters");
        }
        const auth = new GMAuth(config);
        const token = yield auth.authenticate();
        return {
            token,
            auth,
        };
    });
}

var OnStarApiCommand;
(function (OnStarApiCommand) {
    OnStarApiCommand["Alert"] = "alert";
    OnStarApiCommand["CancelAlert"] = "cancelAlert";
    OnStarApiCommand["CancelStart"] = "cancelStart";
    OnStarApiCommand["ChargeOverride"] = "chargeOverride";
    OnStarApiCommand["Connect"] = "connect";
    OnStarApiCommand["Diagnostics"] = "diagnostics";
    OnStarApiCommand["GetChargingProfile"] = "getChargingProfile";
    OnStarApiCommand["LockDoor"] = "lockDoor";
    OnStarApiCommand["SetChargingProfile"] = "setChargingProfile";
    OnStarApiCommand["Start"] = "start";
    OnStarApiCommand["UnlockDoor"] = "unlockDoor";
    OnStarApiCommand["Location"] = "location";
    OnStarApiCommand["LockTrunk"] = "lockTrunk";
    OnStarApiCommand["UnlockTrunk"] = "unlockTrunk";
})(OnStarApiCommand || (OnStarApiCommand = {}));
class RequestService {
    constructor(config, client) {
        var _a, _b, _c;
        this.client = client;
        this.config = Object.assign(Object.assign({}, config), { vin: config.vin.toUpperCase() });
        this.gmAuthConfig = {
            username: this.config.username,
            password: this.config.password,
            deviceId: this.config.deviceId,
            totpKey: this.config.onStarTOTP,
        };
        this.checkRequestStatus = (_a = this.config.checkRequestStatus) !== null && _a !== void 0 ? _a : true;
        this.requestPollingTimeoutSeconds =
            (_b = config.requestPollingTimeoutSeconds) !== null && _b !== void 0 ? _b : 90;
        this.requestPollingIntervalSeconds =
            (_c = config.requestPollingIntervalSeconds) !== null && _c !== void 0 ? _c : 6;
    }
    setClient(client) {
        this.client = client;
        return this;
    }
    setAuthToken(authToken) {
        this.authToken = authToken;
        return this;
    }
    setRequestPollingTimeoutSeconds(seconds) {
        this.requestPollingTimeoutSeconds = seconds;
        return this;
    }
    setRequestPollingIntervalSeconds(seconds) {
        this.requestPollingIntervalSeconds = seconds;
        return this;
    }
    setCheckRequestStatus(checkStatus) {
        this.checkRequestStatus = checkStatus;
        return this;
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            const request = this.getCommandRequest(OnStarApiCommand.Start);
            return this.sendRequest(request);
        });
    }
    cancelStart() {
        return __awaiter(this, void 0, void 0, function* () {
            const request = this.getCommandRequest(OnStarApiCommand.CancelStart);
            return this.sendRequest(request);
        });
    }
    lockDoor() {
        return __awaiter(this, arguments, void 0, function* (options = {}) {
            const request = this.getCommandRequest(OnStarApiCommand.LockDoor).setBody({
                lockDoorRequest: Object.assign({ delay: 0 }, options),
            });
            return this.sendRequest(request);
        });
    }
    unlockDoor() {
        return __awaiter(this, arguments, void 0, function* (options = {}) {
            const request = this.getCommandRequest(OnStarApiCommand.UnlockDoor).setBody({
                unlockDoorRequest: Object.assign({ delay: 0 }, options),
            });
            return this.sendRequest(request);
        });
    }
    lockTrunk() {
        return __awaiter(this, arguments, void 0, function* (options = {}) {
            const request = this.getCommandRequest(OnStarApiCommand.LockTrunk).setBody({
                lockTrunkRequest: Object.assign({ delay: 0 }, options),
            });
            return this.sendRequest(request);
        });
    }
    unlockTrunk() {
        return __awaiter(this, arguments, void 0, function* (options = {}) {
            const request = this.getCommandRequest(OnStarApiCommand.UnlockTrunk).setBody({
                unlockTrunkRequest: Object.assign({ delay: 0 }, options),
            });
            return this.sendRequest(request);
        });
    }
    alert() {
        return __awaiter(this, arguments, void 0, function* (options = {}) {
            const request = this.getCommandRequest(OnStarApiCommand.Alert).setBody({
                alertRequest: Object.assign({ action: [AlertRequestAction.Honk, AlertRequestAction.Flash], delay: 0, duration: 1, override: [
                        AlertRequestOverride.DoorOpen,
                        AlertRequestOverride.IgnitionOn,
                    ] }, options),
            });
            return this.sendRequest(request);
        });
    }
    cancelAlert() {
        return __awaiter(this, void 0, void 0, function* () {
            const request = this.getCommandRequest(OnStarApiCommand.CancelAlert);
            return this.sendRequest(request);
        });
    }
    chargeOverride() {
        return __awaiter(this, arguments, void 0, function* (options = {}) {
            const request = this.getCommandRequest(OnStarApiCommand.ChargeOverride).setBody({
                chargeOverrideRequest: Object.assign({ mode: ChargeOverrideMode.ChargeNow }, options),
            });
            return this.sendRequest(request);
        });
    }
    getChargingProfile() {
        return __awaiter(this, void 0, void 0, function* () {
            const request = this.getCommandRequest(OnStarApiCommand.GetChargingProfile);
            return this.sendRequest(request);
        });
    }
    setChargingProfile() {
        return __awaiter(this, arguments, void 0, function* (options = {}) {
            const request = this.getCommandRequest(OnStarApiCommand.SetChargingProfile).setBody({
                chargingProfile: Object.assign({ chargeMode: ChargingProfileChargeMode.Immediate, rateType: ChargingProfileRateType.Midpeak }, options),
            });
            return this.sendRequest(request);
        });
    }
    diagnostics() {
        return __awaiter(this, arguments, void 0, function* (options = {}) {
            const request = this.getCommandRequest(OnStarApiCommand.Diagnostics).setBody({
                diagnosticsRequest: Object.assign({ diagnosticItem: [
                        DiagnosticRequestItem.Odometer,
                        DiagnosticRequestItem.TirePressure,
                        DiagnosticRequestItem.AmbientAirTemperature,
                        DiagnosticRequestItem.LastTripDistance,
                    ] }, options),
            });
            return this.sendRequest(request);
        });
    }
    getAccountVehicles() {
        return __awaiter(this, void 0, void 0, function* () {
            const request = new Request(`${this.getApiUrlForPath("/account/vehicles")}?includeCommands=true&includeEntitlements=true&includeModules=true&includeSharedVehicles=true`)
                .setUpgradeRequired(false)
                .setMethod(RequestMethod.Get);
            return this.sendRequest(request);
        });
    }
    location() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.sendRequest(this.getCommandRequest(OnStarApiCommand.Location));
        });
    }
    getCommandRequest(command) {
        return new Request(this.getCommandUrl(command));
    }
    getApiUrlForPath(path) {
        return `${onStarAppConfig.serviceUrl}/api/v1${path}`;
    }
    getCommandUrl(command) {
        return this.getApiUrlForPath(`/account/vehicles/${this.config.vin}/commands/${command}`);
    }
    getHeaders(request) {
        return __awaiter(this, void 0, void 0, function* () {
            const headers = {
                Accept: "application/json",
                "Accept-Language": "en-US",
                "Content-Type": request.getContentType(),
                Host: "na-mobile-api.gm.com",
                Connection: "keep-alive",
                "Accept-Encoding": "br, gzip, deflate",
                "User-Agent": onStarAppConfig.userAgent,
            };
            if (request.isAuthRequired()) {
                const authToken = yield this.getAuthToken();
                if (request.isUpgradeRequired() && !authToken.upgraded) {
                    yield this.connectAndUpgradeAuthToken();
                }
                headers["Authorization"] = `Bearer ${authToken.access_token}`;
            }
            return headers;
        });
    }
    connectRequest() {
        return __awaiter(this, void 0, void 0, function* () {
            const request = this.getCommandRequest(OnStarApiCommand.Connect).setUpgradeRequired(false);
            return this.sendRequest(request);
        });
    }
    upgradeRequest() {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error("Not Implemented");
        });
    }
    authTokenRequest(jwt) {
        return __awaiter(this, void 0, void 0, function* () {
            const request = new Request(this.getApiUrlForPath("/oauth/token"))
                .setContentType("text/plain")
                .setAuthRequired(false)
                .setBody(jwt)
                .setHeaders({
                "Accept-Language": "en",
                "User-Agent": onStarAppConfig.userAgent,
            });
            return this.sendRequest(request);
        });
    }
    getAuthToken() {
        return __awaiter(this, void 0, void 0, function* () {
            const { token, auth } = yield getGMAPIJWT(this.gmAuthConfig);
            this.authToken = token;
            return this.authToken;
        });
    }
    refreshAuthToken() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.tokenRefreshPromise) {
                this.tokenRefreshPromise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const token = yield this.createNewAuthToken();
                        resolve(token);
                    }
                    catch (e) {
                        reject(e);
                    }
                    this.tokenRefreshPromise = undefined;
                }));
            }
            return this.tokenRefreshPromise;
        });
    }
    createNewAuthToken() {
        return __awaiter(this, void 0, void 0, function* () {
            const { token, auth } = yield getGMAPIJWT(this.gmAuthConfig);
            this.authToken = token;
            return this.authToken;
        });
    }
    connectAndUpgradeAuthToken() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.tokenUpgradePromise) {
                this.tokenUpgradePromise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                    if (!this.authToken) {
                        return reject("Missing auth token");
                    }
                    try {
                        yield this.connectRequest();
                        yield this.upgradeRequest();
                        this.authToken.upgraded = true;
                        resolve();
                    }
                    catch (e) {
                        reject(e);
                    }
                    this.tokenUpgradePromise = undefined;
                }));
            }
            return this.tokenUpgradePromise;
        });
    }
    sendRequest(request) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const response = yield this.makeClientRequest(request);
                const { data } = response;
                const checkRequestStatus = (_a = request.getCheckRequestStatus()) !== null && _a !== void 0 ? _a : this.checkRequestStatus;
                if (checkRequestStatus && typeof data === "object") {
                    const { commandResponse } = data;
                    if (commandResponse) {
                        const { requestTime, status, url, type } = commandResponse;
                        const requestTimestamp = new Date(requestTime).getTime();
                        if (status === CommandResponseStatus.failure) {
                            throw new RequestError("Command Failure")
                                .setResponse(response)
                                .setRequest(request);
                        }
                        if (Date.now() >=
                            requestTimestamp + this.requestPollingTimeoutSeconds * 1000) {
                            throw new RequestError("Command Timeout")
                                .setResponse(response)
                                .setRequest(request);
                        }
                        if (status === CommandResponseStatus.inProgress &&
                            type !== "connect") {
                            yield this.checkRequestPause();
                            const request = new Request(url)
                                .setMethod(RequestMethod.Get)
                                .setUpgradeRequired(false)
                                .setCheckRequestStatus(checkRequestStatus);
                            return this.sendRequest(request);
                        }
                        return new RequestResult(status).setResponse(response).getResult();
                    }
                }
                return new RequestResult(CommandResponseStatus.success)
                    .setResponse(response)
                    .getResult();
            }
            catch (error) {
                if (error instanceof RequestError) {
                    throw error;
                }
                let errorObj = new RequestError();
                if (axios.isAxiosError(error)) {
                    if (error.response) {
                        errorObj.message = `Request Failed with status ${error.response.status} - ${error.response.statusText}`;
                        errorObj.setResponse(error.response);
                        errorObj.setRequest(error.request);
                    }
                    else if (error.request) {
                        errorObj.message = "No response";
                        errorObj.setRequest(error.request);
                    }
                    else {
                        errorObj.message = error.message;
                    }
                }
                else if (error instanceof Error) {
                    errorObj.message = error.message;
                }
                throw errorObj;
            }
        });
    }
    makeClientRequest(request) {
        return __awaiter(this, void 0, void 0, function* () {
            const headers = yield this.getHeaders(request);
            let requestOptions = {
                headers: Object.assign(Object.assign({}, headers), request.getHeaders()),
            };
            if (request.getMethod() === RequestMethod.Post) {
                requestOptions.headers = Object.assign(Object.assign({}, requestOptions.headers), { "Content-Length": request.getBody().length });
                return this.client.post(request.getUrl(), request.getBody(), requestOptions);
            }
            else {
                return this.client.get(request.getUrl(), requestOptions);
            }
        });
    }
    checkRequestPause() {
        return new Promise((resolve) => setTimeout(resolve, this.requestPollingIntervalSeconds * 1000));
    }
}

class OnStar {
    constructor(requestService) {
        this.requestService = requestService;
    }
    static create(config) {
        const requestService = new RequestService(config, axios);
        return new OnStar(requestService);
    }
    getAccountVehicles() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.getAccountVehicles();
        });
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.start();
        });
    }
    cancelStart() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.cancelStart();
        });
    }
    lockDoor(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.lockDoor(options);
        });
    }
    unlockDoor(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.unlockDoor(options);
        });
    }
    lockTrunk(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.lockTrunk(options);
        });
    }
    unlockTrunk(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.unlockTrunk(options);
        });
    }
    alert(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.alert(options);
        });
    }
    cancelAlert() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.cancelAlert();
        });
    }
    chargeOverride(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.chargeOverride(options);
        });
    }
    getChargingProfile() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.getChargingProfile();
        });
    }
    setChargingProfile(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.setChargingProfile(options);
        });
    }
    diagnostics(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.diagnostics(options);
        });
    }
    location() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestService.location();
        });
    }
    setCheckRequestStatus(checkStatus) {
        this.requestService.setCheckRequestStatus(checkStatus);
    }
}

module.exports = OnStar;

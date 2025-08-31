/*
CORS for DuckDB-Wasm, as a Cloudflare Worker

Based on:
----
CORS Anywhere as a Cloudflare Worker!
(c) 2019 by Zibri (www.zibri.org)
email: zibri AT zibri DOT org
https://github.com/Zibri/cloudflare-cors-anywhere

This Cloudflare Worker script acts as a CORS proxy that allows
cross-origin resource sharing for specified origins and URLs.
It handles OPTIONS preflight requests and modifies response headers accordingly to enable CORS.
The script also includes functionality to parse custom headers and provide detailed information
about the CORS proxy service when accessed without specific parameters.
The script is configurable with whitelist and blacklist patterns, although the blacklist feature is currently unused.
The main goal is to facilitate cross-origin requests while enforcing specific security and rate-limiting policies.
----

*/

// Configuration: Whitelist and Blacklist (not used in this version)
// whitelist = [ "^http.?://shell.duckdb.org$", "duckdb.org$", "test\\..*" ];  // regexp for whitelisted urls
const blacklistUrls = [];           // regexp for blacklisted urls
const whitelistOrigins = [ ".*" ];   // regexp for whitelisted origins

// Function to check if a given URI or origin is listed in the whitelist or blacklist
function isListedInWhitelist(uri, listing) {
    let isListed = false;
    if (typeof uri === "string") {
        listing.forEach((pattern) => {
            if (uri.match(pattern) !== null) {
                isListed = true;
            }
        });
    } else {
        // When URI is null (e.g., when Origin header is missing), decide based on the implementation
        isListed = true; // true accepts null origins, false would reject them
    }
    return isListed;
}

// Event listener for incoming fetch requests
addEventListener("fetch", async event => {
    event.respondWith((async function() {
        const isPreflightRequest = (event.request.method === "OPTIONS");
        
        const originUrl = new URL(event.request.url);

	const url = new URL(originUrl);
	const pathname = url.pathname;

        // Function to modify headers to enable CORS
        function setupCORSHeaders(headers) {
            headers.set("Access-Control-Allow-Origin", event.request.headers.get("Origin"));
            if (isPreflightRequest) {
                headers.set("Access-Control-Allow-Methods", event.request.headers.get("access-control-request-method"));
                const requestedHeaders = event.request.headers.get("access-control-request-headers");

                if (requestedHeaders) {
                    headers.set("Access-Control-Allow-Headers", requestedHeaders);
                }

                headers.delete("X-Content-Type-Options"); // Remove X-Content-Type-Options header
            }
            return headers;
        }

	
	const CORSPROXY_ENDPOINT = '/corsproxy/'
	const CORS_PROXY_ENDPOINT = '/cors_proxy/'
	const S3TABLES_ENDPOINT = '/s3tables_proxy/'
	const S3TABLES_ENDPOINT_TEST = '/s3tables_proxy_test/'
	const origin_to_string = originUrl.toString();

	let targetUrl = "";
	let needsS3Tables = false;
	let skipCF = false;
	let needsCors = false;

	if (pathname.startsWith(CORSPROXY_ENDPOINT) && pathname != CORSPROXY_ENDPOINT) {
		targetUrl =    'https://' + origin_to_string.substr(origin_to_string.indexOf(CORSPROXY_ENDPOINT) + CORSPROXY_ENDPOINT.length);
		needsCors = true;
	} else if (pathname.startsWith(CORS_PROXY_ENDPOINT) && pathname != CORS_PROXY_ENDPOINT) {
		targetUrl =    'https://' + origin_to_string.substr(origin_to_string.indexOf(CORS_PROXY_ENDPOINT) + CORS_PROXY_ENDPOINT.length);
		needsCors = true;
	} else if (pathname.startsWith(S3TABLES_ENDPOINT) && pathname != S3TABLES_ENDPOINT) {
		targetUrl =    'https://' + origin_to_string.substr(origin_to_string.indexOf(S3TABLES_ENDPOINT) + S3TABLES_ENDPOINT.length);
		needsCors = true;
		needsS3Tables = true;
	} else if (pathname.startsWith(S3TABLES_ENDPOINT_TEST) && pathname != S3TABLES_ENDPOINT_TEST) {
		targetUrl =    'https://' + origin_to_string.substr(origin_to_string.indexOf(S3TABLES_ENDPOINT_TEST) + S3TABLES_ENDPOINT_TEST.length);
		needsCors = true;
		needsS3Tables = true;
		skipCF = true;
	}

        const originHeader = event.request.headers.get("Origin");
        const connectingIp = event.request.headers.get("CF-Connecting-IP");

        if ((targetUrl !== "") && (!isListedInWhitelist(targetUrl, blacklistUrls)) && (isListedInWhitelist(originHeader, whitelistOrigins))) {
            let customHeaders = event.request.headers.get("x-cors-headers");

            if (customHeaders !== null) {
                try {
                    customHeaders = JSON.parse(customHeaders);
                } catch (e) {}
            }

            if (true) {
                const filteredHeaders = {};
                for (const [key, value] of event.request.headers.entries()) {
                    if (
                        (key.match("^origin") === null) &&
                        (key.match("eferer") === null) &&
                        ((!skipCF) || (key.match("^cf-") === null)) &&
                        (key.match("^x-forw") === null) &&
                        (key.match("^x-cors-headers") === null) &&
                        ((!needsS3Tables) || (key.toLowerCase().match("^if-range") === null)) &&
                        ((!needsS3Tables) || (key.toLowerCase().match("^sec-fetch-") === null)) &&
                        ((!needsS3Tables) || (key.toLowerCase().match("^x-host-override") === null))
                    ) {
                        filteredHeaders[key] = value;
                    }
                }

				if (customHeaders !== null) {
                    Object.entries(customHeaders).forEach((entry) => (filteredHeaders[entry[0]] = entry[1]));
                }

                const newRequest = new Request(event.request, {
                    redirect: "follow",
                    headers: filteredHeaders
                });

                const response = await fetch(targetUrl, newRequest);
                var responseHeaders = new Headers(response.headers);
                var exposedHeaders = [];
                const allResponseHeaders = {};
                for (const [key, value] of response.headers.entries()) {
                    exposedHeaders.push(key);
                    allResponseHeaders[key] = value;
                }
	
		if (needsCors) {
			exposedHeaders.push("cors-received-headers");
			responseHeaders = setupCORSHeaders(responseHeaders);

			responseHeaders.set("Access-Control-Expose-Headers", exposedHeaders.join(","));
			responseHeaders.set("cors-received-headers", JSON.stringify(allResponseHeaders));
		}

                const responseBody = isPreflightRequest ? null : await response.arrayBuffer();

                const responseInit = {
                    headers: responseHeaders,
                    status: isPreflightRequest ? 200 : response.status,
                    statusText: isPreflightRequest ? "OK" : response.statusText
                };
                return new Response(responseBody, responseInit);

            } else {
                var responseHeaders = new Headers();
                responseHeaders = setupCORSHeaders(responseHeaders);

                let country = false;
                let colo = false;
                if (typeof event.request.cf !== "undefined") {
                    country = event.request.cf.country || false;
                    colo = event.request.cf.colo || false;
                }

                return new Response(
                    "CLOUDFLARE-CORS-ANYWHERE for DuckDB-Wasm\n\n" +
                    "Source:\nhttps://github.com/carlopi/cloudflare-cors-proxy\n\n" +
                    "Usage:\n" +
                    originUrl.origin + "/?uri\n\n" +
                    (originHeader !== null ? "Origin: " + originHeader + "\n" : "") +
                    "IP: " + connectingIp + "\n" +
                    (country ? "Country: " + country + "\n" : "") +
                    (colo ? "Datacenter: " + colo + "\n" : "") +
                    "\n" +
                    (customHeaders !== null ? "\nx-cors-headers: " + JSON.stringify(customHeaders) : ""),
                    {
                        status: 200,
                        headers: responseHeaders
                    }
                );
            }
        } else {
            return new Response(
		"This is a Proxy to be used by DuckDB-Wasm</br>\n" + "</br>\n" +
		"Current valid endpoint are corsproxy/, cors_proxy/ and s3tables_proxy/</br>\n" +
                "Documentation is at <a href='https://duckdb.org/docs/stable/operations_manual/proxy-for-duckdb-wasm'>https://duckdb.org/docs/stable/operations_manual/proxy-for-duckdb-wasm</a></br>\n" +
                "Code is at <a href='https://github.com/carlopi/cloudflare-cors-proxy'>https://github.com/carlopi/cloudflare-cors-proxy</a></br>\n",
                {
                    status: 403,
                    statusText: 'Forbidden',
                    headers: {
                        "Content-Type": "text/html"
                    }
                }
            );
        }
    })());
});

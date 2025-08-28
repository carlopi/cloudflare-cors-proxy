# cloudflare-cors-proxy
Cloudflare CORS proxy in a worker, forked from CLOUDFLARE-CORS-ANYWHERE (https://github.com/Zibri/cloudflare-cors-anywhere)


Current redirect rules are as follow:
#### cors_proxy/* and corsproxy/*
Example:
1. User sent client to `https://<base_url>/cors_proxy/some_other_url.com/a/b/file?params`
2. Proxy (at `https://<base_url>/`) receive, and send request to `https://some_other_url.com/a/b/file?params`
3. Proxy receive back some payload and headers
4. Proxy adds CORS-enabling headers
5. Proxy send the payload (and headers) to the client

#### s3tables_proxy/*
Example:
1. User sent client to `https://<base_url>/s3tables_proxy/some_other_url.com/a/b/file?params`
2. Proxy (at `https://<base_url>/`) receive, and send request to `https://some_other_url.com/a/b/file?params`, filtering `In-Range` headers
3. Proxy receive back some payload and headers
4. Proxy adds CORS-enabling headers
5. Proxy send the payload (and headers) to the client

#### default
Proxy returns a 403 with some comment

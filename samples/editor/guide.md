[日本語](./guide.ja.html)

# Tilia - Phloem Setup Guide

This guide will walk you through setting up an environment to use Tilia's route search functionality with Phloem. It covers both using Docker and running from source code.

By following the steps in this guide, you will be able to open Tilia's sample in your browser and perform route searches using GraphHopper.

Phloem is an API gateway implemented in Ruby on Rails that bridges the client and the routing engine. It is developed alongside Tilia:

- https://github.com/hiroaki/Phloem

Tilia primarily operates on the client side, but route search functionality requires a backend routing engine. By setting up Phloem and a routing engine, you can send route search requests from Tilia.


## 0. Architecture

The basic architecture is as follows:

```
        +---------------------+ 
        | Tilia (Client)      |
        +---------------------+
                  |
                  | Route Search Request
                  v
        +---------------------+
        | Phloem (Gateway)    |
        +---------------------+
                  |
                  | Route Search Request (Forwarded)
                  v 
        +---------------------+
        | GraphHopper         |
        | (Routing Engine)    |
        +---------------------+
```

Phloem receives route search requests from Tilia, forwards them to GraphHopper for route calculation, and then adjusts the response before returning it to Tilia.


## 1. Preparing GraphHopper

GraphHopper is a routing engine that performs route searches on road networks. To use GraphHopper as a backend, you can either use the official GraphHopper API or set up your own GraphHopper server.

However, if you choose to set up your own server, GraphHopper requires a significant amount of disk space and memory, so you will need a machine with sufficient resources.

### Using the Official GraphHopper API

If you use the official GraphHopper API, no setup is required. Create a GraphHopper account and obtain an API key. You will need to set this key as an environment variable when starting Phloem.

### Using Your Own GraphHopper Server

Alternatively, you can set up your own GraphHopper server and use it. For instructions on setting up GraphHopper, refer to the official documentation:

- https://github.com/graphhopper/graphhopper#installation


Phloem's repository also includes configuration files for starting GraphHopper with Docker:

- https://github.com/hiroaki/Phloem/tree/main/tools/routing/graphhopper


## 2. Setting Up Phloem

Phloem is an API gateway implemented in Ruby on Rails that bridges the client and the routing engine. Even if Ruby is not installed on your system or you are not familiar with Rails, you can use the Docker image to set up Phloem with a single command.

### Using Docker

In this guide, the container will mount the `public` directory in the current directory as a volume. If the `public` directory already exists, make sure it is empty to avoid conflicts with existing files. Phloem serves all files under `public` via an HTTP server.

The environment variables for running the container differ depending on whether you are using the official GraphHopper API or your own GraphHopper server.

- **Using the Official GraphHopper API**

  Set the required environment variable `GRAPH_HOPPER_API_KEY` and then run the following command. This will start Phloem and it will be ready to accept route search requests.

  As mentioned earlier, if you are using a Free plan API key, also set `GRAPH_HOPPER_RESTRICTED_PLAN` to `true`.

  ```sh
  export GRAPH_HOPPER_API_KEY=<Your GraphHopper API key>

  docker run --rm \
    -p 3000:3000 \
    -e ROUTING_PROVIDER=graphhopper \
    -e GRAPH_HOPPER_BASE_URL=https://graphhopper.com/api/1 \
    -e GRAPH_HOPPER_API_KEY \
    -e GRAPH_HOPPER_RESTRICTED_PLAN=true \
    -e SECRET_KEY_BASE_DUMMY=1 \
    -v "$(pwd)/public:/rails/public" \
    ghcr.io/hiroaki/phloem:latest
  ```

- **Using Your Own GraphHopper Server**

  If you are using your own GraphHopper server, you do not need to set `GRAPH_HOPPER_API_KEY` or `GRAPH_HOPPER_RESTRICTED_PLAN`. Set the API base URL in the environment variable `GRAPH_HOPPER_BASE_URL` when starting Phloem. For example, if your GraphHopper server is running locally on port 8989, you can start Phloem with the following command:

  ```sh
  docker run --rm \
    -p 3000:3000 \
    -e ROUTING_PROVIDER=graphhopper \
    -e GRAPH_HOPPER_BASE_URL=http://localhost:8989 \
    -e SECRET_KEY_BASE_DUMMY=1 \
    -v "$(pwd)/public:/rails/public" \
    ghcr.io/hiroaki/phloem:latest
  ```

In this example, the server will start in the foreground, so keep the terminal open. To stop the server, press `Ctrl + C`.

### Without Using Docker

If you are not using Docker, you will need to set up the development environment for Phloem. You must have Ruby and Bundler installed. SQLite3 is also required. Phloem is designed to be stateless, but this database is used for Rails caching.

Phloem has been tested with the following versions:

- Ruby 3.4.9
- Bundler 4.0.8

If you want to run it with other versions, adjust or remove the `.ruby-version` file in the top directory of the repository, and modify the Gemfile as needed.

#### Initial Setup

For the first time only, follow these steps to set up the development environment for Phloem. Clone the Phloem repository, install the necessary Ruby libraries (gems), and prepare the database.

```sh
git clone git@github.com:hiroaki/Phloem.git
cd Phloem
bundle install
bin/rails db:prepare
```

#### Starting the Server

Set all server configurations using environment variables. The required environment variables differ depending on whether you are using the official GraphHopper API or your own GraphHopper server.

- **Using the Official GraphHopper API**
  ```
  export GRAPH_HOPPER_BASE_URL=https://graphhopper.com/api/1
  export GRAPH_HOPPER_API_KEY=<Your GraphHopper API key>
  export GRAPH_HOPPER_RESTRICTED_PLAN=true # Add this if using a restricted API key
  ```

- **Using Your Own GraphHopper Server**
  ```
  export GRAPH_HOPPER_BASE_URL=http://localhost:8989
  ```

Once the environment variables are set, start the Phloem server with the following command:

```
bin/rails server -p 3000
``` 

In this example, the server will start in the foreground, so keep the terminal open. To stop the server, press `Ctrl + C`.

## 3. Checking the Server

### Health Check

To verify that Phloem is running correctly, send a request to the following endpoint:

```
curl -i http://localhost:3000/up
```

If the server is running correctly, you should receive a "200 OK" response along with the following HTML content:

```
<!DOCTYPE html><html><body style="background-color: green"></body></html>
```

### Verifying Requests to GraphHopper

To verify that Phloem is receiving route search requests from Tilia and forwarding them to GraphHopper, send a request to the following endpoint (if you are running your own GraphHopper server, adjust the `profile` and `points` accordingly):

```
curl -X POST http://localhost:3000/route \
  -H "Content-Type: application/json" \
  -d '{
    "profile": "car",
    "points": [
      { "lat": 35.68, "lon": 139.76 },
      { "lat": 35.69, "lon": 139.77 }
    ],
    "options": {}
  }'
```

If you receive a JSON response like the following, it confirms that Phloem is successfully forwarding requests to GraphHopper and receiving responses.

```
{"route":{"geometry":{"type":"LineString","coordinates":[[139.75998,35.680005],[139.759657,35.679062],[...(truncated)...],[139.770004,35.689999]]},"distance_meters":2703.289,"duration_seconds":244.55,"provider":"graphhopper","warnings":[]}}
```

## 4. Setting Up Tilia

Phloem's top-level directory contains a `public` directory. Copy the following folders from your Tilia project into this `public` directory. The files placed here will be served via Phloem's HTTP server.

- `plugins`
- `samples`
- `src`

A sample HTML file implementing the route search feature is located at `samples/editor/localhost.html`. This sample is configured to work with a locally running Phloem server. Open this file in a text editor and check the `pluginOptions` settings:

```
pluginOptions: {
  "x-route-search": {
    endpoint: "http://localhost:3000/route",
    defaultProfile: "car",
    profileOptions: ["car", "bike", "foot"]
  }
}
```

Make sure that the `endpoint` points to Phloem's `/route` endpoint. If you are running Phloem on a different URL, update this URL accordingly.

Also, adjust the `defaultProfile` and `profileOptions` as needed to match the profiles available for route search in GraphHopper. For example, if you are using the Free plan of the official GraphHopper API, only `car`, `bike`, and `foot` are available, so make sure these are selectable in Tilia. If you are running your own GraphHopper server, adjust these values according to the available profiles.

## 5. Using Tilia's Route Search Feature

In your browser, access the sample you placed in the `public` directory via HTTP:

- http://localhost:3000/samples/editor/localhost.html

Once the map page is displayed, click the "R" button on the left side of the screen to open the route search panel.

Enter the start and end points for the route search, and click the "Search Routes" button to execute the search. You can specify each point by right-clicking on the map, and you can also move the points by dragging the markers.

The route search results are internally saved as a single GPX data in Tilia and displayed as one of the items in the layer panel "L", so open the layer panel to see them.

> [!TIP]
> Each time you execute a search, new data is added. This is an intentional design for comparing multiple search results. If you want to clear the search results, you can delete the corresponding items from the layer panel.

## 6. Troubleshooting

- **When executing a search, "Failed to fetch" is displayed on the panel**

  Check the server's operation log. If you see an error like the following, Phloem may not be handling CORS preflight requests correctly.

  ```
  Started OPTIONS "/route" for 192.168.65.1 at 2026-06-14 03:13:29 +0000
  ActionController::RoutingError (No route matches [OPTIONS] "/route"):
  ```

  For example, the URLs `http://127.0.0.1` and `http://localhost` refer to the same machine, but the browser treats them as different origins, causing CORS restrictions to apply and the request to fail. Make sure that the URL used to start Phloem and the URL set in Tilia's `endpoint` are the same origin.

- **When executing a search, "Free packages cannot use flexible mode" is displayed on the panel**

  If you are using the Free plan of the official GraphHopper API, there are limitations on the features available. To indicate this, set the environment variable `GRAPH_HOPPER_RESTRICTED_PLAN` to `true` and restart Phloem.

- **When executing a search, "Request validation failed" is displayed on the panel**

  This is a generic error message, so there are various possible causes, but it indicates that there is an issue with the request content. Typically, the profile values may be incorrect, so check the values of `profileOptions` and `defaultProfile` in the route search plugin's `pluginOptions`.

- **When executing a search, "Too many points for Routing API: 7, allowed: 5" is displayed on the panel**

  This is not a setup issue. If you are using the Free plan of the official GraphHopper API, there is a limit on the number of points that can be included in a route search request, and this message indicates that the limit has been exceeded. If you need to search for routes with more points, consider using your own GraphHopper server or upgrading to a paid plan that allows more points.

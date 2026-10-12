export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";

    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Access-Control-Allow-Credentials": "true",
    };

    // 1. Handle Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 2. Wrap the entire logic to guarantee CORS on ANY response
    try {
      const response = await this.handleRequest(request, env);

      // Clone the response so we can add headers
      const newResponse = new Response(response.body, response);
      Object.entries(corsHeaders).forEach(([k, v]) => newResponse.headers.set(k, v));
      return newResponse;
    } catch (err) {
      console.error('Worker Error:', err.message, err.stack);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },

  async handleRequest(request, env) {
    const url = new URL(request.url);
    const id = env.CHAT_ROOM.idFromName("global");
    const obj = env.CHAT_ROOM.get(id);

    if (url.pathname === "/login" && request.method === "POST") {
      // Create a copy of the body so we don't "exhaust" the stream
      const bodyText = await request.text();
      let password = "";
      try {
        const body = JSON.parse(bodyText);
        password = body.password;
      } catch (e) {}

      console.log(`Login attempt. Provided password length: ${password?.length}. Match: ${password === env.CHAT_PASSWORD}`);

      if (password !== env.CHAT_PASSWORD) {
        return new Response(JSON.stringify({ error: "Invalid password" }), { status: 401 });
      }

      // Re-create the request for the Durable Object since we already read the body
      const newRequest = new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: bodyText,
      });
      return obj.fetch(newRequest);
    }

    if (request.headers.get("Upgrade") === "websocket") {
      return obj.fetch(request);
    }

    if (url.pathname === "/") {
      return new Response("Chat Worker is running.", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },
};

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    this.messages = [];
    this.tokens = new Set();

    this.state.blockConcurrencyWhile(async () => {
      let stored = await this.state.storage.get("messages");
      this.messages = stored || [];
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/login") {
      const token = crypto.randomUUID();
      this.tokens.add(token);
      setTimeout(() => this.tokens.delete(token), 3600000);
      return new Response(JSON.stringify({ token }), { status: 200 });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      const token = url.searchParams.get("token");
      if (!token || !this.tokens.has(token)) {
        const [client, server] = new WebSocketPair();
        server.accept();
        server.close(1008, "Invalid or expired token");
        return new Response(null, { status: 101, webSocket: client });
      }
      this.tokens.delete(token);
      const [client, server] = new WebSocketPair();
      await this.handleSession(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not Found", { status: 404 });
  }

  async handleSession(webSocket) {
    webSocket.accept();
    this.sessions.add(webSocket);
    webSocket.send(JSON.stringify({ type: "history", messages: this.messages }));

    webSocket.addEventListener("message", async (msg) => {
      try {
        let data = JSON.parse(msg.data);
        if (data.type === "chat") {
          const message = (data.message || "").substring(0, 300);
          const newMessage = {
            username: data.username,
            message: message,
            timestamp: Date.now(),
          };
          this.messages.push(newMessage);
          if (this.messages.length > 20) this.messages.shift();
          await this.state.storage.put("messages", this.messages);
          this.broadcast(JSON.stringify({ type: "chat", ...newMessage }));
        }
      } catch (err) {
        webSocket.send(JSON.stringify({ type: "error", message: err.message }));
      }
    });

    const cleanup = () => this.sessions.delete(webSocket);
    webSocket.addEventListener("close", cleanup);
    webSocket.addEventListener("error", cleanup);
  }

  broadcast(message) {
    for (let session of this.sessions) {
      try {
        session.send(message);
      } catch (err) {
        this.sessions.delete(session);
      }
    }
  }
}

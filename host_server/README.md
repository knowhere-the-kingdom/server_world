# Host Server

The reusable dedicated-server host surface belongs here. It is part of the
public `server_gamemaster` repository and is not a separate repository.

This first migration slice exposes a versioned, CORS-restricted health/version
service only. It intentionally does not include world simulation, databases,
account identity, or private infrastructure wiring.

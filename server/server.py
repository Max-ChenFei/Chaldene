#!/usr/bin/env python3

from http.server import BaseHTTPRequestHandler, HTTPServer
import os
import json
import shutil

hostName = "localhost"
serverPort = 8080

class FileSystemObj:
    pass

def createDirectory(name):
    return {"type":"dir","name":name, "files":[]}
def createFile(name):
    return {"type":"file","name":name}


def getTree(path, dirname):
    d = createDirectory(dirname)
    new_path = os.path.join(path,dirname)
    for f in os.scandir(new_path):
        if f.is_dir():
            d["files"] = d["files"] + [getTree(new_path,f.name)]
        else:
            d["files"] = d["files"] + [createFile(f.name)]
    return d



class MyServer(BaseHTTPRequestHandler):
    def _set_response(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        result = json.loads(post_data)
        print(result)
        if(result["action"]=="save"):
            print("save")
        elif(result["action"]=="move"):
            shutil.move(result["content"]["src"],result["content"]["dst"])

        self._set_response()
        self.wfile.write(bytes("Success","utf-8"))

    def do_GET(self):
        if(self.path=="/__get_directory_list"):
            self._set_response()
            a = (json.dumps(getTree(".",".")))
            self.wfile.write(bytes(a,"utf-8"))
        else:
            try:
                file = open(self.path[1:],"rb")
                self._set_response()
                self.wfile.write(file.read())
            except FileNotFoundError:
                self.send_response(404)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()


if __name__ == "__main__":
    t = getTree(".",".")
    print(json.dumps(t))
    webServer = HTTPServer((hostName, serverPort), MyServer)
    print("Server started http://%s:%s" % (hostName, serverPort))

    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")
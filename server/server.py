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
           os.makedirs(os.path.dirname(result["content"]["dst"]), exist_ok=True)
           f=open(result["content"]["dst"],"w")
           f.write(result["content"]["file"])
           f.close()

        elif(result["action"]=="move"):
            os.makedirs(os.path.dirname(os.path.normpath(result["content"]["dst"])), exist_ok=True)
            shutil.move(result["content"]["src"],result["content"]["dst"])

        elif(result["action"]=="copy"):
            print("dst: ",os.path.dirname(os.path.normpath(result["content"]["dst"])))

            norm_dest_dir = os.path.dirname(os.path.normpath(result["content"]["dst"]))
            if(len(norm_dest_dir)!=0):
                os.makedirs(norm_dest_dir, exist_ok=True)


            i=0
            help = result["content"]["dst"]
            while(os.path.exists(help)):
                i=i+1
                if(not os.path.isdir(result["content"]["dst"])):
                    s = result["content"]["dst"]
                    ext = s.rfind(".")
                    if(ext<len(os.path.dirname(s))):
                        help = s + "("+str(i)+")"

                    help = s[0:ext]+"("+str(i)+")" + s[ext:]
                else:
                    help = result["content"]["dst"]+"("+str(i)+")"
            result["content"]["dst"] = help;
            print("Paste:", result["content"]["dst"])
            if(os.path.isdir(result["content"]["src"])):
                shutil.copytree(
                    os.path.normpath(result["content"]["src"]),
                    os.path.normpath(result["content"]["dst"])
                )
            else:
                shutil.copy(
                    os.path.normpath(result["content"]["src"]),
                    os.path.normpath(result["content"]["dst"])
                )

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
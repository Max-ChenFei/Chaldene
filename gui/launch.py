import os
import webbrowser
import subprocess
import argparse


parser = argparse.ArgumentParser(
    prog = "VPE GUI Launcher",
    description="Starts the VPE GUI as well as the associated server",
    epilog=""
)

parser.add_argument("--dir",default=".")
parser.add_argument("--server_only",action = "store_true", default=False)
args = parser.parse_args()

if(args.dir != "."):
    cur_dir = os.getcwd()
    os.chdir(os.path.realpath(args.dir))

dir_path = os.path.dirname(os.path.realpath(__file__))

if(not args.server_only):
    webbrowser.open("file://"+ dir_path + "/lumino_test/index.html")

subprocess.Popen(dir_path+"/../server/server.py",shell=True)

if(args.dir != "."):
    os.chdir(cur_dir)
import os

print("building lumino...")
path = os.getcwd()
os.chdir("lumino_test/lumino")
os.system('yarn build')
os.system('yarn run minimize')
os.chdir(path)
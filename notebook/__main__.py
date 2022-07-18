
if __name__ == '__main__':
    import sys
    sys.path = sys.path[1:]
    sys.path.append( r'D:\Program Files\JetBrains\PyCharm 2020.2.3\plugins\python\helpers\pydev');
    a=sys.path
    from notebook import notebookapp as app
    app.launch_new_instance()

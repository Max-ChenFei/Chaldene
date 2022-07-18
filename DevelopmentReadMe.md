# Chaldene: Towards Visual Programming Image Processing in Jupyter Notebooks
##　Setting Up a Development Environment
###　Installing Node.js and npm
We suggest installing conda firstly, and then you can get them with:
```
conda install -c conda-forge nodejs
```

###　Installing the Jupyter Notebook
switch to the notebook directory and run the install command
```
pip install --upgrade setuptools pip
cd notebook
pip install -e .
```
##　Launching the Jupyter Notebook
run the following in the Anaconda Prompt and you will see the Jupyter Notebook user interface.

```
jupyter notebook
```

## Rebuilding JavaScript and CSS
There is a build step for the JavaScript and CSS in the notebook. To make sure that you are working with up-to-date code, you will need to run this command whenever there are changes to JavaScript or LESS sources:
```
npm run build
```
## Development Tip
```
npm run build:watch
```
## Git Hooks
If you want to automatically update dependencies and recompile JavaScript and CSS after checking out a new commit, you can install post-checkout and post-merge hooks which will do it for you:
```
git-hooks/install-hooks.sh
```


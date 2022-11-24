# Chaldene: Towards Visual Programming Image Processing in Jupyter Notebooks
## Usage
```
let canvas = document.getElementById("canvas");
let scene = new Scene(canvas);
canvas.addEventListener("focus", scene.start.bind(scene));
canvas.addEventListener("blur", scene.stop.bind(scene));
window.addEventListener("resize", scene.fitToParentSize.bind(scene));
```
## Cite
https://ieeexplore.ieee.org/document/9832910
```
@INPROCEEDINGS{9832910,
  author={Chen, Fei and Slusallek, Philipp and M&#x00FC;ller, Martin and Dahmen, Tim},
  booktitle={2022 IEEE Symposium on Visual Languages and Human-Centric Computing (VL/HCC)}, 
  title={Chaldene: Towards Visual Programming Image Processing in Jupyter Notebooks}, 
  year={2022},
  volume={},
  number={},
  pages={1-3},
  doi={10.1109/VL/HCC53370.2022.9832910}}
 ```
## Setting Up a Development Environment
### Installing Node.js and npm
We suggest installing conda firstly, and then you can get them with:
```
conda install -c conda-forge nodejs
```

### Installing the Jupyter Notebook
Go the home direcoty of project and run the install command
```
pip install --upgrade setuptools
pip install -e .
```
## Launching the Jupyter Notebook
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

## Git Suggestions

* We use [Git Branching model](https://nvie.com/posts/a-successful-git-branching-model/) for feature management. 

* For each feature, I suggest creating an issue on Github and creating a corresponding feature branch for that. If the issue is fixed, please create a pull request and merge it after peer review.

* The author should add a descriptive, explainable message for each commit, avoiding using some wildcard words like refactoring, and fixing bugs. 

* If someone pushes the wrong changes, please use `git reset` and `git push force` to override the wrong log history. 
* Before each commit, please check the changes you commit, avoiding unused changes selected and committed.


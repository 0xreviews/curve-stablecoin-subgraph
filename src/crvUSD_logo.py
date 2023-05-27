import matplotlib.pyplot as plt 
import numpy as np
cos = np.cos
sin = np.sin
sqrt = np.sqrt
pi = np.pi
LINE_COLOR = "#aaa"

def surf (u, v):
    half = (0 <= u) & (u < pi)
    r = 4 * (1 - cos(u) / 2)
    x = 6 * cos(u) * (1 + sin(u)) + r * cos (v + pi)
    x[half] = (6 * cos(u) * (1 + sin(u)) + r * cos(u) * cos(v))[half]
    y = 16 * sin(u)
    y[half] = (16 * sin(u) + r * sin(u) * cos(v))[half]
    z = r * sin(v)
    # c = np.sqrt((16-16*u*u))
    return x, y, z
# Generate points for the Klein bottle
u, v = np.linspace(0, 1.75*pi, 40), np.linspace(0, 2*pi, 40)
ux, vx = np.meshgrid(u, v)
x, y, z = surf (ux, vx)

# # Generate points for the cylinder
R = 3
# Create 3D plots
fig = plt.figure(figsize= (10, 10))
ax = fig.add_subplot (111, projection= "3d")
# Plot Klein bottle 1 and Klein bottle 2
ax.plot_surface(x, y, z, cmap="jet", alpha=0.95, edgecolor=LINE_COLOR, linewidth=0.3 ) 
ax.plot_surface(-x, -32-y, -z, cmap="jet", alpha=0.95, edgecolor=LINE_COLOR, linewidth=0.3 ) 
# Plot the cylinder
def draw_cylinder(start, height):
    m,n = np.linspace(-R, R, 40), np.linspace(start, start+height, 40),
    mx, nx = np.meshgrid(m, n)
    ax.plot_surface(mx, nx, np.sqrt((R**2-mx*mx)), cmap='rainbow', alpha=0.96, edgecolor=LINE_COLOR, linewidth=0.1 ) 
    ax.plot_surface(mx, nx, -np.sqrt((R**2-mx*mx)), cmap='rainbow', alpha=0.96, edgecolor=LINE_COLOR, linewidth=0.1 ) 

draw_cylinder(18, 25)
draw_cylinder(-80, 27)

plt.show()


# fig.savefig('scatter.svg',dpi=600,format='eps')